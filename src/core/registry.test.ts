import { beforeEach, describe, expect, it } from 'vitest';
import { ExposeRegistry, getRegistry, resetRegistry } from './registry.js';

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
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('not found');
    });

    it('set works with accessor pattern', () => {
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

      registry.set('comp', 'text', 'updated');
      expect(value).toBe('updated');
    });

    it('set works with setXxx convention', () => {
      let value = 0;
      const registry = getRegistry();
      registry.register('comp', {
        setCount: (v: number) => {
          value = v;
        },
      });

      registry.set('comp', 'setCount', 99);
      expect(value).toBe(99);
    });

    it('call invokes functions with args', async () => {
      const registry = getRegistry();
      registry.register('comp', {
        add: (a: number, b: number) => a + b,
      });

      const result = await registry.call('comp', 'add', [2, 3]);
      expect(result).toEqual({ success: true, result: 5 });
    });
  });
});
