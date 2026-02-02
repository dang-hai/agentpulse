import { describe, expect, it } from 'bun:test';
import { allTools, toolDefinitions } from '../../src/core/tools.js';

describe('toolDefinitions', () => {
  it('has all 6 tools defined', () => {
    expect(Object.keys(toolDefinitions)).toHaveLength(6);
    expect(toolDefinitions.expose_list).toBeDefined();
    expect(toolDefinitions.expose_get).toBeDefined();
    expect(toolDefinitions.expose_set).toBeDefined();
    expect(toolDefinitions.expose_call).toBeDefined();
    expect(toolDefinitions.discover).toBeDefined();
    expect(toolDefinitions.interact).toBeDefined();
  });

  it('allTools array matches object values', () => {
    expect(allTools).toHaveLength(6);
    expect(allTools).toContain(toolDefinitions.expose_list);
    expect(allTools).toContain(toolDefinitions.discover);
  });

  describe('Zod schema validation', () => {
    it('expose_list schema accepts empty object', () => {
      const result = toolDefinitions.expose_list.inputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('expose_list schema accepts tag', () => {
      const result = toolDefinitions.expose_list.inputSchema.safeParse({ tag: 'ui' });
      expect(result.success).toBe(true);
    });

    it('expose_get schema requires id and key', () => {
      const result = toolDefinitions.expose_get.inputSchema.safeParse({});
      expect(result.success).toBe(false);

      const validResult = toolDefinitions.expose_get.inputSchema.safeParse({
        id: 'comp',
        key: 'value',
      });
      expect(validResult.success).toBe(true);
    });

    it('expose_set schema requires id, key, and value', () => {
      const result = toolDefinitions.expose_set.inputSchema.safeParse({
        id: 'comp',
        key: 'setValue',
        value: 42,
      });
      expect(result.success).toBe(true);
    });

    it('expose_call schema accepts optional args', () => {
      const withoutArgs = toolDefinitions.expose_call.inputSchema.safeParse({
        id: 'comp',
        key: 'submit',
      });
      expect(withoutArgs.success).toBe(true);

      const withArgs = toolDefinitions.expose_call.inputSchema.safeParse({
        id: 'comp',
        key: 'add',
        args: [1, 2],
      });
      expect(withArgs.success).toBe(true);
    });

    it('discover schema accepts id filter', () => {
      const result = toolDefinitions.discover.inputSchema.safeParse({
        id: 'specific-component',
      });
      expect(result.success).toBe(true);
    });

    it('interact schema validates action types', () => {
      const setAction = toolDefinitions.interact.inputSchema.safeParse({
        target: 'chat-input',
        actions: [{ set: { value: 'hello' } }],
      });
      expect(setAction.success).toBe(true);

      const callAction = toolDefinitions.interact.inputSchema.safeParse({
        target: 'chat-input',
        actions: [{ call: 'send', args: [] }],
      });
      expect(callAction.success).toBe(true);

      const mixed = toolDefinitions.interact.inputSchema.safeParse({
        target: 'chat-input',
        actions: [{ set: { value: 'hello' } }, { call: 'send' }],
      });
      expect(mixed.success).toBe(true);
    });
  });
});
