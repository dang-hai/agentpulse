/**
 * ExposeRegistry
 *
 * Central registry for exposed component bindings.
 * Components register their state and actions here, and MCP tools query it.
 */

import { interactionEmitter } from '../visual/events.js';
import type { InteractionType } from '../visual/types.js';
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

/**
 * Animation hooks for pre/post action execution.
 * These allow the visual layer to animate BEFORE actions execute.
 */
export interface AnimationHooks {
  /** Called before a set operation. Should animate cursor + typing, resolves when ready to execute. */
  preSet?: (componentId: string, key: string, value: unknown) => Promise<void>;
  /** Called after a set operation completes. */
  postSet?: (componentId: string, key: string, success: boolean) => Promise<void>;
  /** Called before a call operation. Should animate cursor + click, resolves when ready to execute. */
  preCall?: (componentId: string, key: string, args: unknown[]) => Promise<void>;
  /** Called after a call operation completes. */
  postCall?: (componentId: string, key: string, success: boolean) => Promise<void>;
}

let interactionCounter = 0;
function generateInteractionId(): string {
  return `int_${Date.now()}_${++interactionCounter}`;
}

export class ExposeRegistry {
  private entries = new Map<string, ExposeEntry>();
  private visualEnabled = true;
  private visualDelay = 800; // ms to wait for cursor animation before executing
  private animationHooks: AnimationHooks | null = null;

  setVisualEnabled(enabled: boolean): void {
    this.visualEnabled = enabled;
  }

  setVisualDelay(delay: number): void {
    this.visualDelay = delay;
  }

  setAnimationHooks(hooks: AnimationHooks | null): void {
    this.animationHooks = hooks;
  }

  getAnimationHooks(): AnimationHooks | null {
    return this.animationHooks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emitStart(
    componentId: string,
    key: string,
    type: InteractionType,
    value?: unknown,
    args?: unknown[]
  ) {
    if (!this.visualEnabled) return null;
    const id = generateInteractionId();
    interactionEmitter.emit({
      type: 'interaction-start',
      id,
      componentId,
      key,
      interactionType: type,
      value,
      args,
      timestamp: Date.now(),
    });
    return id;
  }

  private emitEnd(
    id: string | null,
    componentId: string,
    key: string,
    type: InteractionType,
    success: boolean,
    startTime: number,
    error?: string
  ) {
    if (!this.visualEnabled || !id) return;
    interactionEmitter.emit({
      type: 'interaction-end',
      id,
      componentId,
      key,
      interactionType: type,
      success,
      error,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    });
  }

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
  async set(id: string, key: string, value: unknown): Promise<SetResult> {
    const startTime = Date.now();
    const interactionId = this.emitStart(id, key, 'set', value);

    const entry = this.entries.get(id);
    if (!entry) {
      const error = `Component not found: ${id}`;
      this.emitEnd(interactionId, id, key, 'set', false, startTime, error);
      return { success: false, error };
    }

    const binding = entry.bindings[key];
    if (binding === undefined) {
      const error = `Key not found: ${key}. Available: ${Object.keys(entry.bindings).join(', ')}`;
      this.emitEnd(interactionId, id, key, 'set', false, startTime, error);
      return { success: false, error };
    }

    // Pre-hook: animate cursor to element, start typing animation
    if (this.animationHooks?.preSet) {
      await this.animationHooks.preSet(id, key, value);
    }

    try {
      if (this.isAccessor(binding)) {
        binding.set(value);
        this.emitEnd(interactionId, id, key, 'set', true, startTime);
        if (this.animationHooks?.postSet) {
          await this.animationHooks.postSet(id, key, true);
        }
        return { success: true, value: undefined };
      }

      // Convention: setXxx functions are setters
      if (typeof binding === 'function' && /^set[A-Z]/.test(key)) {
        binding(value);
        this.emitEnd(interactionId, id, key, 'set', true, startTime);
        if (this.animationHooks?.postSet) {
          await this.animationHooks.postSet(id, key, true);
        }
        return { success: true, value: undefined };
      }

      const error = `Key "${key}" is not settable. Use an accessor or setXxx function.`;
      this.emitEnd(interactionId, id, key, 'set', false, startTime, error);
      if (this.animationHooks?.postSet) {
        await this.animationHooks.postSet(id, key, false);
      }
      return { success: false, error };
    } catch (err) {
      this.emitEnd(interactionId, id, key, 'set', false, startTime, String(err));
      if (this.animationHooks?.postSet) {
        await this.animationHooks.postSet(id, key, false);
      }
      return { success: false, error: String(err) };
    }
  }

  /**
   * Call an exposed action
   */
  async call(id: string, key: string, args: unknown[] = []): Promise<CallResult> {
    const startTime = Date.now();
    const interactionId = this.emitStart(id, key, 'call', undefined, args);

    const entry = this.entries.get(id);
    if (!entry) {
      const error = `Component not found: ${id}`;
      this.emitEnd(interactionId, id, key, 'call', false, startTime, error);
      return { success: false, error };
    }

    const binding = entry.bindings[key];
    if (binding === undefined) {
      const error = `Key not found: ${key}. Available: ${Object.keys(entry.bindings).join(', ')}`;
      this.emitEnd(interactionId, id, key, 'call', false, startTime, error);
      return { success: false, error };
    }

    if (typeof binding !== 'function') {
      const error = `Key "${key}" is not callable. It's a ${typeof binding}.`;
      this.emitEnd(interactionId, id, key, 'call', false, startTime, error);
      return { success: false, error };
    }

    // Pre-hook: animate cursor to element, show click animation
    if (this.animationHooks?.preCall) {
      await this.animationHooks.preCall(id, key, args);
    } else if (this.visualEnabled && this.visualDelay > 0) {
      // Fallback to simple delay if no hooks
      await this.delay(this.visualDelay);
    }

    try {
      const value = await binding(...args);
      this.emitEnd(interactionId, id, key, 'call', true, startTime);

      // Post-hook: show success feedback
      if (this.animationHooks?.postCall) {
        await this.animationHooks.postCall(id, key, true);
      }

      return { success: true, value };
    } catch (err) {
      this.emitEnd(interactionId, id, key, 'call', false, startTime, String(err));

      // Post-hook: show error feedback
      if (this.animationHooks?.postCall) {
        await this.animationHooks.postCall(id, key, false);
      }

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
