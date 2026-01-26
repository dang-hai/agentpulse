/**
 * WebSocket Transport Client
 *
 * Connects browser to AgentPulse MCP server via WebSocket.
 * Handles request/response correlation and incoming proxy requests.
 */

import type {
  Transport,
  ProcedureName,
  Procedures,
  Request,
  Response,
  RequestHandler,
} from '../core/protocol.js';
import { getRegistry } from '../core/registry.js';

export interface WebSocketTransportOptions {
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
 * WebSocket transport for browser ↔ server communication.
 *
 * @example
 * const transport = new WebSocketTransport({ url: 'ws://localhost:3100/ws' });
 * await transport.connect();
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private pending = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private requestHandler: RequestHandler | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private options: Required<WebSocketTransportOptions>;

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      url: options.url,
      reconnect: options.reconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (event) => {
          if (!this.connected) {
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
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    this.options.reconnect = false; // Prevent reconnection
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
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }

    const id = crypto.randomUUID();
    const req: Request<P> = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
      });
      this.ws!.send(JSON.stringify(req));
    });
  }

  onRequest(handler: RequestHandler): void {
    this.requestHandler = handler;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if this is a response to a pending request
      if ('id' in message && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)!;
        this.pending.delete(message.id);

        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
        return;
      }

      // Otherwise, treat as incoming request (proxy from server)
      if ('method' in message && 'params' in message) {
        this.handleIncomingRequest(message as Request);
      }
    } catch (error) {
      console.error('[AgentPulse] Failed to parse message:', error);
    }
  }

  private async handleIncomingRequest(req: Request): Promise<void> {
    let result: unknown;
    let error: string | undefined;

    try {
      // Execute against local registry
      const registry = getRegistry();

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
          result = registry.set(p.id, p.key, p.value);
          break;
        }
        case 'call': {
          const p = req.params as Procedures['call']['input'];
          result = await registry.call(p.id, p.key, p.args);
          break;
        }
        default:
          error = `Unknown method: ${req.method}`;
      }
    } catch (e) {
      error = String(e);
    }

    // Send response back to server
    const response = { id: req.id, result, error };
    this.ws?.send(JSON.stringify(response));
  }

  private handleDisconnect(): void {
    // Reject all pending requests
    for (const { reject } of this.pending.values()) {
      reject(new Error('Connection closed'));
    }
    this.pending.clear();

    // Attempt reconnect if enabled
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
