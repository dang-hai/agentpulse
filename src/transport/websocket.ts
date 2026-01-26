/**
 * WebSocket Transport Client
 *
 * Connects browser to AgentPulse MCP server via WebSocket.
 * Handles request/response correlation and incoming proxy requests.
 */

import { parseMessage } from '../core/parse.js';
import type {
  ProcedureName,
  Procedures,
  Request,
  RequestHandler,
  Transport,
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

        this.ws.onerror = () => {
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
    // Capture ws to avoid race between check and use
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
    // Handler stored for future use with server-initiated requests
  }

  private handleMessage(data: string): void {
    const parsed = parseMessage(data);

    switch (parsed.type) {
      case 'response': {
        const response = parsed.response;
        const pendingRequest = this.pending.get(response.id);
        if (pendingRequest) {
          const { resolve, reject } = pendingRequest;
          this.pending.delete(response.id);

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
        }
        break;
      }
      case 'request':
        this.handleIncomingRequest(parsed.request);
        break;
      case 'invalid':
        console.error('[AgentPulse] Invalid message:', parsed.reason, parsed.raw);
        break;
    }
  }

  private async handleIncomingRequest(req: Request): Promise<void> {
    const registry = getRegistry();

    // Execute against local registry and build proper discriminated response
    const sendResponse = (
      response: { id: string; result: unknown } | { id: string; error: string }
    ) => {
      if (this.ws) {
        this.ws.send(JSON.stringify(response));
      } else {
        console.error('[AgentPulse] Cannot send response - connection closed');
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
          result = registry.set(p.id, p.key, p.value);
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
