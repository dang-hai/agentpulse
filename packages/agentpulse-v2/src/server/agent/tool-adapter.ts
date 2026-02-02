/**
 * Tool Adapter
 *
 * Converts Zod schemas to JSON Schema format for LLM consumption,
 * and executes tool calls against the registry.
 */

import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ExposeRegistry } from '../../core/registry.js';
import { toolDefinitions } from '../../core/tools.js';
import type { ToolCall, ToolResult } from '../../core/types.js';
import type { LLMTool } from '../providers/base.js';

/**
 * Simple tool definition shape for conversion
 */
interface SimpleToolDef {
  name: string;
  description: string;
  inputSchema: ZodType;
}

/**
 * Convert a Zod-based tool definition to LLM tool format
 */
export function zodToLLMTool(tool: SimpleToolDef): LLMTool {
  const jsonSchema = zodToJsonSchema(tool.inputSchema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });

  const { $schema, ...inputSchema } = jsonSchema as Record<string, unknown>;

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: inputSchema as Record<string, unknown>,
  };
}

/**
 * Convert all AgentPulse tool definitions to LLM format
 */
export function getAgentPulseTools(): LLMTool[] {
  return Object.values(toolDefinitions).map((tool) =>
    zodToLLMTool(tool as unknown as SimpleToolDef)
  );
}

/**
 * Execute a tool call against the registry
 */
export async function executeToolCall(
  registry: ExposeRegistry,
  call: ToolCall
): Promise<ToolResult> {
  const toolName = call.name as keyof typeof toolDefinitions;
  const tool = toolDefinitions[toolName];

  if (!tool) {
    return {
      id: call.id,
      content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
      isError: true,
    };
  }

  try {
    const parseResult = tool.inputSchema.safeParse(call.input);

    if (!parseResult.success) {
      return {
        id: call.id,
        content: JSON.stringify({
          error: 'Invalid input',
          details: parseResult.error.format(),
        }),
        isError: true,
      };
    }

    // Use type assertion since we've validated the input
    const result = await (tool.execute as (reg: ExposeRegistry, input: unknown) => unknown)(
      registry,
      parseResult.data
    );

    return {
      id: call.id,
      content: JSON.stringify(result),
      isError: false,
    };
  } catch (error) {
    return {
      id: call.id,
      content: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      isError: true,
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(
  registry: ExposeRegistry,
  calls: ToolCall[]
): Promise<ToolResult[]> {
  return Promise.all(calls.map((call) => executeToolCall(registry, call)));
}
