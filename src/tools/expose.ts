/**
 * Basic Expose Tools
 *
 * MCP tools for listing, getting, setting, and calling exposed bindings.
 */

import { z } from 'zod';
import { getRegistry } from '../core/registry.js';

// ============================================================================
// expose_list - List all exposed components
// ============================================================================

export const exposeListSchema = z.object({
  tag: z.string().optional().describe('Filter by tag'),
});

export type ExposeListInput = z.infer<typeof exposeListSchema>;

export async function exposeList(params: ExposeListInput) {
  const registry = getRegistry();
  const entries = registry.list(params.tag ? { tag: params.tag } : undefined);

  return {
    success: true,
    count: entries.length,
    entries,
  };
}

// ============================================================================
// expose_get - Get a value from an exposed component
// ============================================================================

export const exposeGetSchema = z.object({
  id: z.string().describe('Component ID (e.g., "chat-input")'),
  key: z.string().describe('Key to get (e.g., "value", "isLoading")'),
});

export type ExposeGetInput = z.infer<typeof exposeGetSchema>;

export async function exposeGet(params: ExposeGetInput) {
  const registry = getRegistry();
  return registry.get(params.id, params.key);
}

// ============================================================================
// expose_set - Set a value on an exposed component
// ============================================================================

export const exposeSetSchema = z.object({
  id: z.string().describe('Component ID'),
  key: z.string().describe('Key to set (must be a setter or accessor)'),
  value: z.unknown().describe('Value to set'),
});

export type ExposeSetInput = z.infer<typeof exposeSetSchema>;

export async function exposeSet(params: ExposeSetInput) {
  const registry = getRegistry();
  return registry.set(params.id, params.key, params.value);
}

// ============================================================================
// expose_call - Call an action on an exposed component
// ============================================================================

export const exposeCallSchema = z.object({
  id: z.string().describe('Component ID'),
  key: z.string().describe('Action to call (e.g., "send", "clear")'),
  args: z.array(z.unknown()).optional().describe('Arguments to pass'),
});

export type ExposeCallInput = z.infer<typeof exposeCallSchema>;

export async function exposeCall(params: ExposeCallInput) {
  const registry = getRegistry();
  return registry.call(params.id, params.key, params.args ?? []);
}
