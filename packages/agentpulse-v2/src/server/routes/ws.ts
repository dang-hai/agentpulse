/**
 * WebSocket Route Handler
 *
 * /ws - Real-time component sync between browser and server
 */

import type { ServerWebSocket } from 'bun';
import { getRegistry } from '../../core/registry.js';
import type {
  ProcedureName,
  Procedures,
  Request as ProtocolRequest,
  Response as ProtocolResponse,
} from '../../core/protocol.js';

/**
 * WebSocket client data
 */
export interface WSClientData {
  id: string;
  connectedAt: number;
}

/**
 * Connected clients map
 */
const clients = new Map<string, ServerWebSocket<WSClientData>>();

/**
 * Generate a unique client ID
 */
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Handle WebSocket upgrade
 */
export function handleWSUpgrade(req: Request, server: { upgrade: (req: Request, options: { data: WSClientData }) => boolean }): Response | undefined {
  const clientId = generateClientId();
  const success = server.upgrade(req, {
    data: {
      id: clientId,
      connectedAt: Date.now(),
    },
  });

  if (success) {
    return undefined;
  }

  return new Response('WebSocket upgrade failed', { status: 500 });
}

/**
 * Handle WebSocket open
 */
export function handleWSOpen(ws: ServerWebSocket<WSClientData>): void {
  clients.set(ws.data.id, ws);
  ws.send(JSON.stringify({ type: 'connected', clientId: ws.data.id }));
}

/**
 * Handle WebSocket close
 */
export function handleWSClose(ws: ServerWebSocket<WSClientData>): void {
  clients.delete(ws.data.id);
}

/**
 * Handle WebSocket message from browser
 */
export async function handleWSMessage(
  ws: ServerWebSocket<WSClientData>,
  message: string | ArrayBuffer | Uint8Array
): Promise<void> {
  const msgString = typeof message === 'string' ? message : new TextDecoder().decode(message);

  let request: ProtocolRequest;
  try {
    request = JSON.parse(msgString);
  } catch {
    ws.send(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const registry = getRegistry();
  let result: unknown;

  try {
    switch (request.method) {
      case 'list': {
        const params = request.params as Procedures['list']['input'];
        result = registry.list(params);
        break;
      }

      case 'discover': {
        const params = request.params as Procedures['discover']['input'];
        result = registry.discover(params);
        break;
      }

      case 'get': {
        const params = request.params as Procedures['get']['input'];
        result = registry.get(params.id, params.key);
        break;
      }

      case 'set': {
        const params = request.params as Procedures['set']['input'];
        result = await registry.set(params.id, params.key, params.value);
        break;
      }

      case 'call': {
        const params = request.params as Procedures['call']['input'];
        result = await registry.call(params.id, params.key, params.args);
        break;
      }

      case 'register': {
        const params = request.params as Procedures['register']['input'];
        registry.register(params.id, {}, {
          description: params.description,
          tags: params.tags,
        });
        result = { success: true };
        broadcastExcept(ws.data.id, {
          type: 'component_registered',
          id: params.id,
          keys: params.keys,
        });
        break;
      }

      case 'unregister': {
        const params = request.params as Procedures['unregister']['input'];
        registry.unregister(params.id);
        result = { success: true };
        broadcastExcept(ws.data.id, {
          type: 'component_unregistered',
          id: params.id,
        });
        break;
      }

      default:
        ws.send(
          JSON.stringify({
            id: request.id,
            error: `Unknown method: ${(request as ProtocolRequest).method}`,
          })
        );
        return;
    }

    const response = { id: request.id, result };
    ws.send(JSON.stringify(response));
  } catch (error) {
    const response = {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
    ws.send(JSON.stringify(response));
  }
}

/**
 * Broadcast a message to all connected clients except one
 */
function broadcastExcept(excludeId: string, message: unknown): void {
  const msgString = JSON.stringify(message);
  for (const [id, client] of clients) {
    if (id !== excludeId) {
      client.send(msgString);
    }
  }
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(message: unknown): void {
  const msgString = JSON.stringify(message);
  for (const client of clients.values()) {
    client.send(msgString);
  }
}

/**
 * Get count of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Get all connected client IDs
 */
export function getClientIds(): string[] {
  return Array.from(clients.keys());
}
