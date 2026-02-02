/**
 * SSE Stream Utilities
 *
 * Helpers for encoding and streaming Server-Sent Events.
 */

import type { AgentStreamEvent } from '../../core/types.js';

/**
 * Encode an event as SSE format
 */
export function encodeSSE(event: AgentStreamEvent): string {
  const data = JSON.stringify(event);
  return `data: ${data}\n\n`;
}

/**
 * Encode multiple events as SSE format
 */
export function encodeSSEBatch(events: AgentStreamEvent[]): string {
  return events.map(encodeSSE).join('');
}

/**
 * Create a ReadableStream that yields SSE-encoded events
 */
export function createSSEStream(
  source: AsyncGenerator<AgentStreamEvent>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await source.next();

      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(encodeSSE(value)));
    },
  });
}

/**
 * SSE Response headers
 */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

/**
 * Create an SSE Response from an async generator
 */
export function createSSEResponse(
  source: AsyncGenerator<AgentStreamEvent>,
  headers?: Record<string, string>
): Response {
  return new Response(createSSEStream(source), {
    headers: { ...SSE_HEADERS, ...headers },
  });
}
