/**
 * Agent Route Handler
 *
 * POST /api/agent - Run agent with SSE streaming
 */

import { z } from 'zod';
import { getRegistry } from '../../core/registry.js';
import { runAgent, runAgentLoop } from '../agent/loop.js';
import { createSSEResponse } from '../agent/stream.js';
import { createProvider, getDefaultModel, type ProviderName } from '../providers/index.js';

const AgentRequestSchema = z.object({
  goal: z.string().min(1, 'Goal is required'),
  provider: z.enum(['anthropic', 'openai']).optional().default('anthropic'),
  model: z.string().optional(),
  maxTurns: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
  stream: z.boolean().optional().default(true),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

/**
 * Handle POST /api/agent request
 */
export async function handleAgentRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parseResult = AgentRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid request',
        details: parseResult.error.format(),
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const { goal, provider: providerName, model, maxTurns, systemPrompt, stream } = parseResult.data;

  const llmProvider = createProvider(providerName as ProviderName);
  const actualModel = model ?? getDefaultModel(providerName as ProviderName);
  const registry = getRegistry();

  const loopOptions = {
    provider: llmProvider,
    registry,
    goal,
    model: actualModel,
    systemPrompt,
    maxTurns,
  };

  if (stream) {
    const generator = runAgentLoop(loopOptions);
    return createSSEResponse(generator, {
      'Access-Control-Allow-Origin': '*',
    });
  }

  const { events, result } = await runAgent(loopOptions);
  return new Response(JSON.stringify({ events, result }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
