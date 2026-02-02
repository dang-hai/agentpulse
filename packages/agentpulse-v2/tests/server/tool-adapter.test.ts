import { beforeEach, describe, expect, it } from 'bun:test';
import { getRegistry, resetRegistry } from '../../src/core/registry.js';
import { toolDefinitions } from '../../src/core/tools.js';
import type { ToolCall } from '../../src/core/types.js';
import {
  executeToolCall,
  executeToolCalls,
  getAgentPulseTools,
  zodToLLMTool,
} from '../../src/server/agent/tool-adapter.js';

describe('tool-adapter', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('zodToLLMTool', () => {
    it('converts expose_list tool to LLM format', () => {
      const tool = zodToLLMTool(toolDefinitions.expose_list);

      expect(tool.name).toBe('expose_list');
      expect(tool.description).toBe(
        'List all exposed components. Use this first to discover what can be controlled.'
      );
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    });

    it('converts expose_get tool with required properties', () => {
      const tool = zodToLLMTool(toolDefinitions.expose_get);

      expect(tool.name).toBe('expose_get');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.required).toContain('id');
      expect(tool.inputSchema.required).toContain('key');
    });

    it('converts expose_set tool with value schema', () => {
      const tool = zodToLLMTool(toolDefinitions.expose_set);

      expect(tool.name).toBe('expose_set');
      expect(tool.inputSchema.properties).toHaveProperty('id');
      expect(tool.inputSchema.properties).toHaveProperty('key');
      expect(tool.inputSchema.properties).toHaveProperty('value');
    });

    it('converts interact tool with complex action schema', () => {
      const tool = zodToLLMTool(toolDefinitions.interact);

      expect(tool.name).toBe('interact');
      expect(tool.inputSchema.properties).toHaveProperty('target');
      expect(tool.inputSchema.properties).toHaveProperty('actions');
    });
  });

  describe('getAgentPulseTools', () => {
    it('returns all tools in LLM format', () => {
      const tools = getAgentPulseTools();

      expect(tools.length).toBe(6);
      const names = tools.map((t) => t.name);
      expect(names).toContain('expose_list');
      expect(names).toContain('expose_get');
      expect(names).toContain('expose_set');
      expect(names).toContain('expose_call');
      expect(names).toContain('discover');
      expect(names).toContain('interact');
    });

    it('all tools have valid JSON Schema format', () => {
      const tools = getAgentPulseTools();

      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('executeToolCall', () => {
    it('executes expose_list successfully', async () => {
      const registry = getRegistry();
      registry.register('test-component', { value: 42 });

      const call: ToolCall = {
        id: 'call_1',
        name: 'expose_list',
        input: {},
      };

      const result = await executeToolCall(registry, call);

      expect(result.id).toBe('call_1');
      expect(result.isError).toBe(false);

      const content = JSON.parse(result.content);
      expect(content).toHaveLength(1);
      expect(content[0].id).toBe('test-component');
    });

    it('executes expose_get successfully', async () => {
      const registry = getRegistry();
      registry.register('my-input', { text: 'hello world' });

      const call: ToolCall = {
        id: 'call_2',
        name: 'expose_get',
        input: { id: 'my-input', key: 'text' },
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content);
      expect(content.success).toBe(true);
      expect(content.value).toBe('hello world');
    });

    it('executes expose_set successfully', async () => {
      let value = 'initial';
      const registry = getRegistry();
      registry.register('my-input', {
        text: {
          get: () => value,
          set: (v: unknown) => {
            value = v as string;
          },
        },
      });

      const call: ToolCall = {
        id: 'call_3',
        name: 'expose_set',
        input: { id: 'my-input', key: 'text', value: 'updated' },
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(false);
      expect(value).toBe('updated');
    });

    it('executes expose_call successfully', async () => {
      const registry = getRegistry();
      registry.register('calculator', {
        add: (a: number, b: number) => a + b,
      });

      const call: ToolCall = {
        id: 'call_4',
        name: 'expose_call',
        input: { id: 'calculator', key: 'add', args: [2, 3] },
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content);
      expect(content.success).toBe(true);
      expect(content.value).toBe(5);
    });

    it('executes discover successfully', async () => {
      const registry = getRegistry();
      registry.register('component', { count: 10 }, { description: 'A counter' });

      const call: ToolCall = {
        id: 'call_5',
        name: 'discover',
        input: {},
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(false);
      const content = JSON.parse(result.content);
      expect(content).toHaveLength(1);
      expect(content[0].currentState).toEqual({ count: 10 });
      expect(content[0].description).toBe('A counter');
    });

    it('returns error for unknown tool', async () => {
      const registry = getRegistry();

      const call: ToolCall = {
        id: 'call_err',
        name: 'nonexistent_tool',
        input: {},
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown tool');
    });

    it('returns error for invalid input', async () => {
      const registry = getRegistry();

      const call: ToolCall = {
        id: 'call_invalid',
        name: 'expose_get',
        input: { wrongField: 'value' },
      };

      const result = await executeToolCall(registry, call);

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid input');
    });
  });

  describe('executeToolCalls', () => {
    it('executes multiple calls in parallel', async () => {
      const registry = getRegistry();
      registry.register('a', { val: 1 });
      registry.register('b', { val: 2 });

      const calls: ToolCall[] = [
        { id: 'c1', name: 'expose_get', input: { id: 'a', key: 'val' } },
        { id: 'c2', name: 'expose_get', input: { id: 'b', key: 'val' } },
      ];

      const results = await executeToolCalls(registry, calls);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('c1');
      expect(results[1].id).toBe('c2');

      const v1 = JSON.parse(results[0].content);
      const v2 = JSON.parse(results[1].content);
      expect(v1.value).toBe(1);
      expect(v2.value).toBe(2);
    });
  });
});
