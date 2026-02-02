import { beforeEach, describe, expect, it } from 'bun:test';
import { ExposeRegistry, getRegistry, resetRegistry } from '../../src/core/registry.js';

describe('ExposeRegistry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('singleton behavior', () => {
    it('getRegistry returns same instance', () => {
      const a = getRegistry();
      const b = getRegistry();
      expect(a).toBe(b);
    });

    it('resetRegistry creates fresh instance', () => {
      const before = getRegistry();
      before.register('test', { value: 1 });

      resetRegistry();

      const after = getRegistry();
      expect(after).not.toBe(before);
      expect(after.has('test')).toBe(false);
    });
  });

  describe('register/unregister lifecycle', () => {
    it('register returns unregister function', () => {
      const registry = getRegistry();
      const unregister = registry.register('comp', { x: 1 });

      expect(registry.has('comp')).toBe(true);
      unregister();
      expect(registry.has('comp')).toBe(false);
    });

    it('re-registering same ID updates bindings (no error)', () => {
      const registry = getRegistry();
      registry.register('comp', { x: 1 });
      registry.register('comp', { x: 2, y: 3 });

      const result = registry.get('comp', 'x');
      expect(result).toEqual({ success: true, value: 2 });
    });
  });

  describe('list with tag filter', () => {
    it('lists all registered components', () => {
      const registry = getRegistry();
      registry.register('comp-1', { a: 1 }, { tags: ['ui'] });
      registry.register('comp-2', { b: 2 }, { tags: ['data'] });

      const all = registry.list();
      expect(all).toHaveLength(2);
    });

    it('filters by tag', () => {
      const registry = getRegistry();
      registry.register('comp-1', { a: 1 }, { tags: ['ui'] });
      registry.register('comp-2', { b: 2 }, { tags: ['data'] });

      const uiOnly = registry.list({ tag: 'ui' });
      expect(uiOnly).toHaveLength(1);
      expect(uiOnly[0].id).toBe('comp-1');
    });
  });

  describe('get/set/call operations', () => {
    it('get returns value for primitives', () => {
      const registry = getRegistry();
      registry.register('comp', { count: 42 });

      expect(registry.get('comp', 'count')).toEqual({
        success: true,
        value: 42,
      });
    });

    it('get returns error for missing component', () => {
      const registry = getRegistry();
      const result = registry.get('nonexistent', 'key');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    });

    it('get returns error for missing key', () => {
      const registry = getRegistry();
      registry.register('comp', { exists: 1 });

      const result = registry.get('comp', 'missing');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Key not found');
      }
    });

    it('set works with accessor pattern', async () => {
      let value = 'initial';
      const registry = getRegistry();
      registry.register('comp', {
        text: {
          get: () => value,
          set: (v: unknown) => {
            value = v as string;
          },
        },
      });

      await registry.set('comp', 'text', 'updated');
      expect(value).toBe('updated');
    });

    it('set works with setXxx convention', async () => {
      let value = 0;
      const registry = getRegistry();
      registry.register('comp', {
        setCount: (v: number) => {
          value = v;
        },
      });

      await registry.set('comp', 'setCount', 99);
      expect(value).toBe(99);
    });

    it('set returns error for non-settable key', async () => {
      const registry = getRegistry();
      registry.register('comp', { readonly: 42 });

      const result = await registry.set('comp', 'readonly', 100);
      expect(result.success).toBe(false);
    });

    it('call invokes functions with args', async () => {
      const registry = getRegistry();
      registry.register('comp', {
        add: (a: number, b: number) => a + b,
      });

      const result = await registry.call('comp', 'add', [2, 3]);
      expect(result).toEqual({ success: true, value: 5 });
    });

    it('call returns error for non-callable key', async () => {
      const registry = getRegistry();
      registry.register('comp', { notAFunction: 42 });

      const result = await registry.call('comp', 'notAFunction', []);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not callable');
      }
    });
  });

  describe('discover', () => {
    it('returns components with current state', () => {
      const registry = getRegistry();
      registry.register('comp', { count: 42, name: 'test' }, { description: 'Test component' });

      const discovered = registry.discover();
      expect(discovered).toHaveLength(1);
      expect(discovered[0].id).toBe('comp');
      expect(discovered[0].currentState).toEqual({ count: 42, name: 'test' });
      expect(discovered[0].description).toBe('Test component');
    });

    it('filters by id', () => {
      const registry = getRegistry();
      registry.register('comp-1', { a: 1 });
      registry.register('comp-2', { b: 2 });

      const discovered = registry.discover({ id: 'comp-1' });
      expect(discovered).toHaveLength(1);
      expect(discovered[0].id).toBe('comp-1');
    });
  });
});
