/**
 * Agent Execution Loop
 *
 * Runs the agent tool-use cycle: send messages to LLM, execute tools, repeat.
 */

import { DEFAULT_MAX_TURNS } from '../../core/constants.js';
import type { ExposeRegistry } from '../../core/registry.js';
import type {
  AgentMessage,
  AgentRunResult,
  AgentStreamEvent,
  ToolResult,
} from '../../core/types.js';
import type { LLMProvider } from '../providers/base.js';
import { executeToolCalls, getAgentPulseTools } from './tool-adapter.js';

/**
 * Options for running the agent
 */
export interface AgentLoopOptions {
  provider: LLMProvider;
  registry: ExposeRegistry;
  goal: string;
  model: string;
  systemPrompt?: string;
  maxTurns?: number;
}

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Default system prompt for the agent
 */
const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant that can control a React application through exposed component bindings.

Available tools allow you to:
- discover: List available components with their current state
- expose_list: List all exposed component IDs
- expose_get: Get a specific value from a component
- expose_set: Set a value on a component (must be a setter or accessor)
- expose_call: Call an action on a component
- interact: Execute multiple actions on a component in sequence

Start by using 'discover' to understand what components are available and their current state.
Then use the appropriate tools to accomplish the user's goal.

Be concise and efficient. Execute the minimum number of tool calls needed.`;

/**
 * Run the agent execution loop as an async generator
 */
export async function* runAgentLoop(
  options: AgentLoopOptions
): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
  const {
    provider,
    registry,
    goal,
    model,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    maxTurns = DEFAULT_MAX_TURNS,
  } = options;

  const runId = generateRunId();
  const messages: AgentMessage[] = [];
  const tools = getAgentPulseTools();
  let toolCallCount = 0;

  yield { type: 'start', runId };

  messages.push({ role: 'user', content: goal });

  for (let turn = 0; turn < maxTurns; turn++) {
    let response;
    try {
      response = await provider.complete({
        model,
        messages,
        tools,
        systemPrompt,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      yield { type: 'error', error: errorMsg };

      return {
        success: false,
        messages,
        finalResponse: '',
        error: errorMsg,
        toolCallCount,
      };
    }

    if (response.content) {
      yield { type: 'text', content: response.content };
    }

    const assistantMessage: AgentMessage = {
      role: 'assistant',
      content: response.content,
      toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    };
    messages.push(assistantMessage);

    if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
      const result: AgentRunResult = {
        success: true,
        messages,
        finalResponse: response.content,
        toolCallCount,
      };

      yield { type: 'done', result };
      return result;
    }

    for (const call of response.toolCalls) {
      yield { type: 'tool_call', call };
    }

    const toolResults = await executeToolCalls(registry, response.toolCalls);
    toolCallCount += toolResults.length;

    for (const result of toolResults) {
      yield { type: 'tool_result', result };
    }

    const toolMessage: AgentMessage = {
      role: 'tool',
      content: '',
      toolResults,
    };
    messages.push(toolMessage);

    if (response.stopReason === 'max_tokens') {
      yield { type: 'error', error: 'Response truncated due to max tokens' };
    }
  }

  const errorMsg = `Max turns (${maxTurns}) exceeded`;
  yield { type: 'error', error: errorMsg };

  return {
    success: false,
    messages,
    finalResponse: '',
    error: errorMsg,
    toolCallCount,
  };
}

/**
 * Run the agent loop and collect all events (non-streaming)
 */
export async function runAgent(options: AgentLoopOptions): Promise<{
  events: AgentStreamEvent[];
  result: AgentRunResult;
}> {
  const events: AgentStreamEvent[] = [];
  const generator = runAgentLoop(options);

  let iterResult = await generator.next();
  while (!iterResult.done) {
    events.push(iterResult.value);
    iterResult = await generator.next();
  }

  return { events, result: iterResult.value };
}
