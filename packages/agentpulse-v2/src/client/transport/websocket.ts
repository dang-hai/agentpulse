/**
 * WebSocket Transport
 *
 * Connects browser to AgentPulse server via WebSocket.
 * Used for self-hosted deployments.
 */

import type { ProcedureName, Procedures, Request, RequestHandler } from '../../core/protocol.js';
import { getRegistry } from '../../core/registry.js';
import type { ClientTransport, TransportOptions } from './base.js';

export interface WebSocketTransportOptions extends TransportOptions {
  /** WebSocket endpoint URL (e.g., 'ws://localhost:3100/ws') */
  url: string;
  /** Reconnect on disconnect (default: true) */
  reconnect?: boolean;
  /** Reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
}

/**
 * WebSocket transport for browser <-> server communication.
 *
 * @example
 * const transport = new WebSocketTransport({ url: 'ws://localhost:3100/ws' });
 * await transport.connect();
 */
export class WebSocketTransport implements ClientTransport {
  private ws: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private connected = false;
  private reconnectAttempts = 0;
  private options: Required<WebSocketTransportOptions>;

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      url: options.url,
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      connectionTimeout: options.connectionTimeout ?? 5000,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = () => {
          if (!this.connected) {
            clearTimeout(timeout);
            reject(new Error('WebSocket connection failed'));
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.handleDisconnect();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.options.reconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.pending.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  async request<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']> {
    const ws = this.ws;
    if (!this.connected || !ws) {
      throw new Error('Not connected');
    }

    const id = crypto.randomUUID();
    const req: Request<P> = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });
      ws.send(JSON.stringify(req));
    });
  }

  onRequest(_handler: RequestHandler): void {
    // Stored for future use with server-initiated requests
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      if ('method' in msg && 'id' in msg) {
        this.handleIncomingRequest(msg as Request);
      } else if ('id' in msg) {
        const pendingRequest = this.pending.get(msg.id);
        if (pendingRequest) {
          const { resolve, reject } = pendingRequest;
          this.pending.delete(msg.id);

          if (msg.error) {
            reject(new Error(msg.error));
          } else {
            resolve(msg.result);
          }
        }
      }
    } catch {
      console.error('[AgentPulse] Invalid message:', data);
    }
  }

  private async handleIncomingRequest(req: Request): Promise<void> {
    const registry = getRegistry();

    const sendResponse = (
      response: { id: string; result: unknown } | { id: string; error: string }
    ) => {
      if (this.ws) {
        this.ws.send(JSON.stringify(response));
      }
    };

    try {
      let result: unknown;

      switch (req.method) {
        case 'list':
          result = registry.list(req.params as Procedures['list']['input']);
          break;
        case 'discover':
          result = registry.discover(req.params as Procedures['discover']['input']);
          break;
        case 'get': {
          const p = req.params as Procedures['get']['input'];
          result = registry.get(p.id, p.key);
          break;
        }
        case 'set': {
          const p = req.params as Procedures['set']['input'];
          result = await registry.set(p.id, p.key, p.value);
          break;
        }
        case 'call': {
          const p = req.params as Procedures['call']['input'];
          result = await registry.call(p.id, p.key, p.args);
          break;
        }
        default:
          sendResponse({ id: req.id, error: `Unknown method: ${req.method}` });
          return;
      }

      sendResponse({ id: req.id, result });
    } catch (e) {
      sendResponse({ id: req.id, error: String(e) });
    }
  }

  private handleDisconnect(): void {
    for (const { reject } of this.pending.values()) {
      reject(new Error('Connection closed'));
    }
    this.pending.clear();

    if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(() => {
          // Reconnect failed, will retry if attempts remain
        });
      }, this.options.reconnectDelay);
    }
  }
}
