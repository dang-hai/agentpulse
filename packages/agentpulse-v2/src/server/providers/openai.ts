/**
 * OpenAI GPT Provider
 *
 * Implements LLMProvider for OpenAI's GPT API.
 */

import OpenAI from 'openai';
import type { AgentMessage, ToolCall, ToolResult } from '../../core/types.js';
import type {
  CompletionOptions,
  LLMProvider,
  LLMResponse,
  LLMTool,
  ProviderConfig,
} from './base.js';

type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam;
type OpenAITool = OpenAI.Chat.ChatCompletionTool;

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(config: ProviderConfig = {}) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? Bun.env.OPENAI_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const { model, messages, tools, systemPrompt, maxTokens = 4096 } = options;

    const openAIMessages = this.convertMessages(messages, systemPrompt);

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: openAIMessages,
      tools: this.convertTools(tools),
    });

    return this.parseResponse(response);
  }

  private convertMessages(
    messages: AgentMessage[],
    systemPrompt?: string
  ): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content || null,
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.input),
            },
          }));
        }

        result.push(assistantMsg);
      } else if (msg.role === 'tool' && msg.toolResults) {
        for (const r of msg.toolResults as ToolResult[]) {
          result.push({
            role: 'tool',
            tool_call_id: r.id,
            content: r.content,
          });
        }
      }
    }

    return result;
  }

  private convertTools(tools: LLMTool[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  private parseResponse(
    response: OpenAI.Chat.ChatCompletion
  ): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;
    const toolCalls: ToolCall[] = [];

    if (message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.type === 'function') {
          toolCalls.push({
            id: call.id,
            name: call.function.name,
            input: JSON.parse(call.function.arguments),
          });
        }
      }
    }

    let stopReason: LLMResponse['stopReason'];
    switch (choice.finish_reason) {
      case 'tool_calls':
        stopReason = 'tool_use';
        break;
      case 'length':
        stopReason = 'max_tokens';
        break;
      case 'stop':
        stopReason = 'end_turn';
        break;
      default:
        stopReason = 'end_turn';
    }

    return {
      stopReason,
      content: message.content ?? '',
      toolCalls,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
