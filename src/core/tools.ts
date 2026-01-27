/**
 * AgentPulse Tool Definitions
 *
 * Single source of truth for MCP tool schemas.
 * Used by both WebSocket and Electron MCP servers.
 * Can also be used for client-side LLM integration.
 */

import { z } from 'zod';
import type { ExposeRegistry } from './registry.js';
import type {
  CallResult,
  DiscoverInfo,
  ExposeInfo,
  InteractAction,
  InteractResult,
  SetResult,
} from './types.js';

// Re-export InteractAction for convenience
export type { InteractAction } from './types.js';

/**
 * Tool definition with schema and execution logic.
 *
 * Note: inputSchema uses z.ZodTypeAny rather than z.ZodType<TInput> because
 * Zod's type inference has quirks (e.g., z.unknown() produces optional types).
 * The schema is for runtime validation; TInput provides compile-time types.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (registry: ExposeRegistry, input: TInput) => TOutput | Promise<TOutput>;
}

// Input types for each tool
export interface ListInput {
  tag?: string;
}

export interface GetInput {
  id: string;
  key: string;
}

export interface SetInput {
  id: string;
  key: string;
  value: unknown;
}

export interface CallInput {
  id: string;
  key: string;
  args?: unknown[];
}

export interface DiscoverInput {
  tag?: string;
  id?: string;
}

export interface InteractInput {
  target: string;
  actions: InteractAction[];
}

// Zod schemas for each tool
const listSchema = z.object({
  tag: z.string().optional().describe('Filter by tag'),
});

const getSchema = z.object({
  id: z.string().describe('Component ID (e.g., "chat-input")'),
  key: z.string().describe('Key to get (e.g., "value", "isLoading")'),
});

const setSchema = z.object({
  id: z.string().describe('Component ID'),
  key: z.string().describe('Key to set (must be a setter or accessor)'),
  value: z.unknown().describe('Value to set'),
});

const callSchema = z.object({
  id: z.string().describe('Component ID'),
  key: z.string().describe('Action to call (e.g., "send", "clear")'),
  args: z.array(z.unknown()).optional().describe('Arguments to pass'),
});

const discoverSchema = z.object({
  tag: z.string().optional().describe('Filter by tag'),
  id: z.string().optional().describe('Filter to specific component ID'),
});

const interactSchema = z.object({
  target: z.string().describe('Component ID to interact with'),
  actions: z
    .array(
      z.union([
        z.object({ set: z.record(z.unknown()).describe('Key-value pairs to set') }),
        z.object({
          call: z.string().describe('Action name to call'),
          args: z.array(z.unknown()).optional().describe('Arguments for the action'),
        }),
      ])
    )
    .describe('Actions to execute in sequence'),
});

/**
 * Execute the interact tool's batch operations.
 * Runs set/call actions in sequence against the registry.
 */
async function executeInteract(
  registry: ExposeRegistry,
  input: InteractInput
): Promise<InteractResult> {
  const { target, actions } = input;
  const results: Array<SetResult | CallResult> = [];

  for (const action of actions) {
    if ('set' in action && action.set) {
      for (const [key, value] of Object.entries(action.set)) {
        const result = registry.set(target, key, value);
        results.push(result);
      }
    } else if ('call' in action) {
      const result = await registry.call(target, action.call, action.args ?? []);
      results.push(result);
    }
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}

/**
 * All AgentPulse tool definitions.
 * Each tool has a schema and execute function that operates on the registry.
 */
export const toolDefinitions = {
  expose_list: {
    name: 'expose_list',
    description: 'List all exposed components. Use this first to discover what can be controlled.',
    inputSchema: listSchema,
    execute: (registry: ExposeRegistry, input: ListInput): ExposeInfo[] => registry.list(input),
  } satisfies ToolDefinition<ListInput, ExposeInfo[]>,

  expose_get: {
    name: 'expose_get',
    description: 'Get a value from an exposed component.',
    inputSchema: getSchema,
    execute: (registry: ExposeRegistry, input: GetInput) => registry.get(input.id, input.key),
  } satisfies ToolDefinition<GetInput, ReturnType<ExposeRegistry['get']>>,

  expose_set: {
    name: 'expose_set',
    description: 'Set a value on an exposed component.',
    inputSchema: setSchema,
    execute: (registry: ExposeRegistry, input: SetInput) =>
      registry.set(input.id, input.key, input.value),
  } satisfies ToolDefinition<SetInput, SetResult>,

  expose_call: {
    name: 'expose_call',
    description: 'Call an action on an exposed component.',
    inputSchema: callSchema,
    execute: (registry: ExposeRegistry, input: CallInput) =>
      registry.call(input.id, input.key, input.args ?? []),
  } satisfies ToolDefinition<CallInput, Promise<CallResult>>,

  discover: {
    name: 'discover',
    description:
      'Discover components with rich info including current state and description. ' +
      'Use this instead of expose_list when you want to understand and act quickly.',
    inputSchema: discoverSchema,
    execute: (registry: ExposeRegistry, input: DiscoverInput): DiscoverInfo[] =>
      registry.discover(input),
  } satisfies ToolDefinition<DiscoverInput, DiscoverInfo[]>,

  interact: {
    name: 'interact',
    description:
      'Execute multiple actions on a component. ' +
      'Bundles set/call actions in a single call to reduce round trips.',
    inputSchema: interactSchema,
    execute: executeInteract,
  } satisfies ToolDefinition<InteractInput, Promise<InteractResult>>,
} as const;

/**
 * Tool names as a union type
 */
export type ToolName = keyof typeof toolDefinitions;

/**
 * Array of all tool definitions (useful for iteration)
 */
export const allTools = Object.values(toolDefinitions);
