import { beforeEach, describe, expect, it } from 'bun:test';
import { getRegistry, resetRegistry } from '../../src/core/registry.js';
import type { AgentMessage, AgentStreamEvent, ToolCall } from '../../src/core/types.js';
import { runAgent, runAgentLoop } from '../../src/server/agent/loop.js';
import type {
  CompletionOptions,
  LLMProvider,
  LLMResponse,
} from '../../src/server/providers/base.js';

class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private responses: LLMResponse[] = [];
  private callIndex = 0;
  public completionCalls: CompletionOptions[] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async complete(options: CompletionOptions): Promise<LLMResponse> {
    this.completionCalls.push({
      ...options,
      messages: [...options.messages],
    });
    const response = this.responses[this.callIndex];
    if (!response) {
      throw new Error('No more mock responses configured');
    }
    this.callIndex++;
    return response;
  }
}

describe('agent-loop', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('runAgentLoop', () => {
    it('emits start event with runId', async () => {
      const provider = new MockProvider([
        { stopReason: 'end_turn', content: 'Done!', toolCalls: [] },
      ]);
      const registry = getRegistry();

      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Test goal',
        model: 'test-model',
      });

      const { value } = await generator.next();
      expect(value).toMatchObject({ type: 'start' });
      expect((value as { type: 'start'; runId: string }).runId).toMatch(/^run_/);
    });

    it('emits text event for assistant response', async () => {
      const provider = new MockProvider([
        { stopReason: 'end_turn', content: 'Hello from assistant!', toolCalls: [] },
      ]);
      const registry = getRegistry();

      const events: AgentStreamEvent[] = [];
      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Say hello',
        model: 'test-model',
      });

      let result = await generator.next();
      while (!result.done) {
        events.push(result.value);
        result = await generator.next();
      }

      const textEvent = events.find((e) => e.type === 'text');
      expect(textEvent).toBeDefined();
      expect((textEvent as { type: 'text'; content: string }).content).toBe(
        'Hello from assistant!'
      );
    });

    it('emits done event with successful result', async () => {
      const provider = new MockProvider([
        { stopReason: 'end_turn', content: 'Task complete!', toolCalls: [] },
      ]);
      const registry = getRegistry();

      const events: AgentStreamEvent[] = [];
      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Complete task',
        model: 'test-model',
      });

      let result = await generator.next();
      while (!result.done) {
        events.push(result.value);
        result = await generator.next();
      }

      const doneEvent = events.find((e) => e.type === 'done');
      expect(doneEvent).toBeDefined();
      const doneResult = (doneEvent as { type: 'done'; result: unknown }).result;
      expect(doneResult).toMatchObject({
        success: true,
        finalResponse: 'Task complete!',
        toolCallCount: 0,
      });
    });

    it('executes tool calls and emits events', async () => {
      const registry = getRegistry();
      registry.register('counter', { count: 5 });

      const discoverCall: ToolCall = {
        id: 'tc_1',
        name: 'discover',
        input: {},
      };

      const provider = new MockProvider([
        { stopReason: 'tool_use', content: 'Let me check...', toolCalls: [discoverCall] },
        { stopReason: 'end_turn', content: 'Found counter with count=5', toolCalls: [] },
      ]);

      const events: AgentStreamEvent[] = [];
      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'What components exist?',
        model: 'test-model',
      });

      let result = await generator.next();
      while (!result.done) {
        events.push(result.value);
        result = await generator.next();
      }

      const toolCallEvent = events.find((e) => e.type === 'tool_call');
      expect(toolCallEvent).toBeDefined();
      expect((toolCallEvent as { type: 'tool_call'; call: ToolCall }).call.name).toBe('discover');

      const toolResultEvent = events.find((e) => e.type === 'tool_result');
      expect(toolResultEvent).toBeDefined();

      expect(result.value.toolCallCount).toBe(1);
    });

    it('respects maxTurns limit', async () => {
      const toolCall: ToolCall = { id: 'tc', name: 'expose_list', input: {} };
      const provider = new MockProvider([
        { stopReason: 'tool_use', content: '', toolCalls: [toolCall] },
        { stopReason: 'tool_use', content: '', toolCalls: [toolCall] },
        { stopReason: 'tool_use', content: '', toolCalls: [toolCall] },
      ]);
      const registry = getRegistry();

      const events: AgentStreamEvent[] = [];
      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Loop forever',
        model: 'test-model',
        maxTurns: 2,
      });

      let result = await generator.next();
      while (!result.done) {
        events.push(result.value);
        result = await generator.next();
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent as { type: 'error'; error: string }).error).toContain('Max turns');

      expect(result.value.success).toBe(false);
    });

    it('emits error event on provider failure', async () => {
      const provider = new MockProvider([]);
      const registry = getRegistry();

      const events: AgentStreamEvent[] = [];
      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Will fail',
        model: 'test-model',
      });

      let result = await generator.next();
      while (!result.done) {
        events.push(result.value);
        result = await generator.next();
      }

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(result.value.success).toBe(false);
    });

    it('passes system prompt to provider', async () => {
      const provider = new MockProvider([
        { stopReason: 'end_turn', content: 'OK', toolCalls: [] },
      ]);
      const registry = getRegistry();

      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Test',
        model: 'test-model',
        systemPrompt: 'Custom system prompt',
      });

      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }

      expect(provider.completionCalls[0].systemPrompt).toBe('Custom system prompt');
    });

    it('accumulates messages across turns', async () => {
      const registry = getRegistry();
      registry.register('test', { x: 1 });

      const toolCall: ToolCall = { id: 'tc', name: 'expose_list', input: {} };
      const provider = new MockProvider([
        { stopReason: 'tool_use', content: 'Checking...', toolCalls: [toolCall] },
        { stopReason: 'end_turn', content: 'Done', toolCalls: [] },
      ]);

      const generator = runAgentLoop({
        provider,
        registry,
        goal: 'Test messages',
        model: 'test-model',
      });

      let result = await generator.next();
      while (!result.done) {
        result = await generator.next();
      }

      expect(provider.completionCalls).toHaveLength(2);
      const firstMessages = provider.completionCalls[0].messages;
      const secondMessages = provider.completionCalls[1].messages;

      expect(firstMessages.length).toBe(1);
      expect(firstMessages[0].role).toBe('user');
      expect(firstMessages[0].content).toBe('Test messages');

      expect(secondMessages.length).toBeGreaterThan(firstMessages.length);
      expect(secondMessages[0].role).toBe('user');
      expect(secondMessages[1].role).toBe('assistant');
      expect(secondMessages[2].role).toBe('tool');
    });
  });

  describe('runAgent', () => {
    it('collects all events and returns result', async () => {
      const provider = new MockProvider([
        { stopReason: 'end_turn', content: 'All done!', toolCalls: [] },
      ]);
      const registry = getRegistry();

      const { events, result } = await runAgent({
        provider,
        registry,
        goal: 'Test',
        model: 'test-model',
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'start')).toBe(true);
      expect(events.some((e) => e.type === 'done')).toBe(true);

      expect(result.success).toBe(true);
      expect(result.finalResponse).toBe('All done!');
    });

    it('handles multiple tool calls in sequence', async () => {
      const registry = getRegistry();
      registry.register('input', {
        value: {
          get: () => 'test',
          set: () => {},
        },
      });

      const calls: ToolCall[] = [
        { id: 't1', name: 'discover', input: {} },
        { id: 't2', name: 'expose_get', input: { id: 'input', key: 'value' } },
      ];

      const provider = new MockProvider([
        { stopReason: 'tool_use', content: '', toolCalls: calls },
        { stopReason: 'end_turn', content: 'Found value: test', toolCalls: [] },
      ]);

      const { events, result } = await runAgent({
        provider,
        registry,
        goal: 'Get value',
        model: 'test-model',
      });

      expect(result.success).toBe(true);
      expect(result.toolCallCount).toBe(2);

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      expect(toolCallEvents).toHaveLength(2);
    });
  });
});
