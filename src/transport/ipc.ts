/**
 * IPC Transport for Electron
 *
 * Connects renderer to main process via Electron IPC.
 */

import type {
  ProcedureName,
  Procedures,
  Request,
  RequestHandler,
  Transport,
} from '../core/protocol.js';
import { getRegistry } from '../core/registry.js';

export interface AgentPulseBridge {
  send: (channel: string, data: unknown) => void;
  invoke: (channel: string, data: unknown) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
}

declare global {
  interface Window {
    agentpulse?: AgentPulseBridge;
  }
}

/**
 * Create an IPC transport for Electron.
 *
 * Auto-detects window.agentpulse bridge set up by preload script.
 * Throws immediately if bridge is not found (fail-fast).
 *
 * @example
 * const transport = createIPCTransport();
 * await transport.connect();
 *
 * @throws Error if window.agentpulse is not available
 */
export function createIPCTransport(): IPCTransport {
  if (typeof window === 'undefined' || !window.agentpulse) {
    throw new Error(
      '[AgentPulse] IPC bridge not found. Make sure setupAgentPulse() is called in preload.'
    );
  }
  return new IPCTransport(window.agentpulse);
}

/**
 * IPC transport for Electron renderer ↔ main communication.
 *
 * Use createIPCTransport() for auto-detection, or construct directly for testing.
 *
 * @example
 * // Production: auto-detect
 * const transport = createIPCTransport();
 *
 * @example
 * // Testing: inject mock
 * const transport = new IPCTransport(mockBridge);
 */
export class IPCTransport implements Transport {
  private connected = false;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly bridge: AgentPulseBridge) {}

  async connect(): Promise<void> {
    if (this.connected) return;

    this.unsubscribe = this.bridge.on('request', (data) => {
      this.handleIncomingRequest(data as Request);
    });

    this.bridge.send('connect', {});
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    this.bridge.send('disconnect', {});
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async request<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const id = crypto.randomUUID();
    const req: Request<P> = { id, method, params };

    const response = (await this.bridge.invoke('request', req)) as {
      result?: Procedures[P]['output'];
      error?: string;
    };

    if (response.error) {
      throw new Error(response.error);
    }

    return response.result as Procedures[P]['output'];
  }

  onRequest(_handler: RequestHandler): void {
    // Handler stored for future use
  }

  private async handleIncomingRequest(req: Request): Promise<void> {
    let result: unknown;
    let error: string | undefined;

    try {
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

    this.bridge.send('response', { id: req.id, result, error });
  }
}
