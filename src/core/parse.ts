/**
 * Protocol Message Parsing
 *
 * Centralized parsing and validation for protocol messages.
 * All trust boundaries should use these parsers to ensure type safety.
 */

import type { ProcedureName, Request, Response } from './protocol.js';

/**
 * Type guard for Request messages
 */
export function isRequest(value: unknown): value is Request {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'method' in value &&
    typeof value.method === 'string' &&
    'params' in value
  );
}

/**
 * Type guard for successful Response messages
 */
export function isSuccessResponse(value: unknown): value is Response & { result: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'result' in value &&
    !('error' in value && value.error !== undefined)
  );
}

/**
 * Type guard for error Response messages
 */
export function isErrorResponse(value: unknown): value is Response & { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

/**
 * Type guard for any Response message (success or error)
 */
export function isResponse(value: unknown): value is Response {
  return isSuccessResponse(value) || isErrorResponse(value);
}

/**
 * Parsed message result - discriminated union for safe handling
 */
export type ParsedMessage =
  | { type: 'request'; request: Request }
  | { type: 'response'; response: Response }
  | { type: 'invalid'; raw: unknown; reason: string };

/**
 * Parse a raw message string into a typed message.
 * Use this at trust boundaries (WebSocket, IPC) to safely handle incoming data.
 *
 * @example
 * const parsed = parseMessage(data);
 * switch (parsed.type) {
 *   case 'request':
 *     handleRequest(parsed.request);
 *     break;
 *   case 'response':
 *     handleResponse(parsed.response);
 *     break;
 *   case 'invalid':
 *     console.error('Invalid message:', parsed.reason);
 *     break;
 * }
 */
export function parseMessage(data: string): ParsedMessage {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return { type: 'invalid', raw: data, reason: 'Invalid JSON' };
  }

  if (isRequest(json)) {
    return { type: 'request', request: json };
  }

  if (isResponse(json)) {
    return { type: 'response', response: json };
  }

  return { type: 'invalid', raw: json, reason: 'Unknown message format' };
}

/**
 * Check if a request is for a specific method (with type narrowing)
 */
export function isMethod<M extends ProcedureName>(
  request: Request,
  method: M
): request is Request<M> {
  return request.method === method;
}
