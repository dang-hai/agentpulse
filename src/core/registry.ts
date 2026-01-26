/**
 * ExposeRegistry
 *
 * Central registry for exposed component bindings.
 * Components register their state and actions here, and MCP tools query it.
 */

import type {
  Bindings,
  BindingValue,
  CallResult,
  DiscoverInfo,
  ExposeEntry,
  ExposeInfo,
  ExposeOptions,
  GetResult,
  SetResult,
} from './types.js';

export class ExposeRegistry {
  private entries = new Map<string, ExposeEntry>();

  /**
   * Register bindings for a component.
   * Returns an unregister function for cleanup.
   */
  register(id: string, bindings: Bindings, options: ExposeOptions = {}): () => void {
    const { description, tags = [] } = options;

    const existing = this.entries.get(id);
    if (existing) {
      existing.bindings = bindings;
      existing.description = description;
      existing.tags = tags;
      return () => this.unregister(id);
    }

    const entry: ExposeEntry = {
      id,
      bindings,
      description,
      tags,
      registeredAt: Date.now(),
    };

    this.entries.set(id, entry);
    return () => this.unregister(id);
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  /**
   * List all registered entries (basic info)
   */
  list(filter?: { tag?: string }): ExposeInfo[] {
    const results: ExposeInfo[] = [];

    for (const entry of this.entries.values()) {
      if (filter?.tag && !entry.tags.includes(filter.tag)) {
        continue;
      }
      results.push(this.toInfo(entry));
    }

    return results;
  }

  /**
   * Discover components with rich info including current state
   */
  discover(filter?: { tag?: string; id?: string }): DiscoverInfo[] {
    const results: DiscoverInfo[] = [];

    for (const entry of this.entries.values()) {
      if (filter?.tag && !entry.tags.includes(filter.tag)) {
        continue;
      }
      if (filter?.id && entry.id !== filter.id) {
        continue;
      }

      const currentState: Record<string, unknown> = {};
      for (const [key, binding] of Object.entries(entry.bindings)) {
        try {
          currentState[key] = this.resolveValue(binding);
        } catch {
          currentState[key] = '[Error reading value]';
        }
      }

      results.push({
        id: entry.id,
        keys: Object.keys(entry.bindings),
        description: entry.description,
        tags: entry.tags,
        registeredAt: entry.registeredAt,
        currentState,
      });
    }

    return results;
  }

  /**
   * Get a value from an exposed binding
   */
  get(id: string, key: string): GetResult {
    const entry = this.entries.get(id);
    if (!entry) {
      return { success: false, error: `Component not found: ${id}` };
    }

    const binding = entry.bindings[key];
    if (binding === undefined) {
      return {
        success: false,
        error: `Key not found: ${key}. Available: ${Object.keys(entry.bindings).join(', ')}`,
      };
    }

    try {
      const value = this.resolveValue(binding);
      return { success: true, value };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Get all current state for a component
   */
  getState(id: string): Record<string, unknown> | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;

    const state: Record<string, unknown> = {};
    for (const [key, binding] of Object.entries(entry.bindings)) {
      try {
        state[key] = this.resolveValue(binding);
      } catch {
        state[key] = '[Error]';
      }
    }
    return state;
  }

  /**
   * Set a value on an exposed binding
   */
  set(id: string, key: string, value: unknown): SetResult {
    const entry = this.entries.get(id);
    if (!entry) {
      return { success: false, error: `Component not found: ${id}` };
    }

    const binding = entry.bindings[key];
    if (binding === undefined) {
      return {
        success: false,
        error: `Key not found: ${key}. Available: ${Object.keys(entry.bindings).join(', ')}`,
      };
    }

    try {
      if (this.isAccessor(binding)) {
        binding.set(value);
        return { success: true, value: undefined };
      }

      // Convention: setXxx functions are setters
      if (typeof binding === 'function' && /^set[A-Z]/.test(key)) {
        binding(value);
        return { success: true, value: undefined };
      }

      return {
        success: false,
        error: `Key "${key}" is not settable. Use an accessor or setXxx function.`,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Call an exposed action
   */
  async call(id: string, key: string, args: unknown[] = []): Promise<CallResult> {
    const entry = this.entries.get(id);
    if (!entry) {
      return { success: false, error: `Component not found: ${id}` };
    }

    const binding = entry.bindings[key];
    if (binding === undefined) {
      return {
        success: false,
        error: `Key not found: ${key}. Available: ${Object.keys(entry.bindings).join(', ')}`,
      };
    }

    if (typeof binding !== 'function') {
      return {
        success: false,
        error: `Key "${key}" is not callable. It's a ${typeof binding}.`,
      };
    }

    try {
      const value = await binding(...args);
      return { success: true, value };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  clear(): void {
    this.entries.clear();
  }

  private toInfo(entry: ExposeEntry): ExposeInfo {
    return {
      id: entry.id,
      keys: Object.keys(entry.bindings),
      description: entry.description,
      tags: entry.tags,
      registeredAt: entry.registeredAt,
    };
  }

  private isAccessor(
    binding: BindingValue
  ): binding is { get: () => unknown; set: (value: unknown) => void } {
    return (
      typeof binding === 'object' &&
      binding !== null &&
      'get' in binding &&
      'set' in binding &&
      typeof binding.get === 'function' &&
      typeof binding.set === 'function'
    );
  }

  private resolveValue(binding: BindingValue): unknown {
    if (this.isAccessor(binding)) {
      return binding.get();
    }
    if (typeof binding === 'function') {
      return '[Function]';
    }
    return binding;
  }
}

// Singleton
let registryInstance: ExposeRegistry | null = null;

export function getRegistry(): ExposeRegistry {
  if (!registryInstance) {
    registryInstance = new ExposeRegistry();
  }
  return registryInstance;
}

export function resetRegistry(): void {
  registryInstance?.clear();
  registryInstance = null;
}
