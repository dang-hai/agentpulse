/**
 * IPC Transport for Electron
 *
 * Connects renderer to main process via Electron IPC.
 */

import { isRequest } from '../core/parse.js';
import type {
  ProcedureName,
  Procedures,
  Request,
  RequestHandler,
  Transport,
} from '../core/protocol.js';
import { getRegistry } from '../core/registry.js';
import type { AgentPulseBridge } from '../core/types.js';

export type { AgentPulseBridge };

interface IPCResponse {
  result?: unknown;
  error?: string;
}

function isIPCResponse(value: unknown): value is IPCResponse {
  return typeof value === 'object' && value !== null;
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
      if (isRequest(data)) {
        this.handleIncomingRequest(data);
      } else {
        console.error('[AgentPulse] Invalid request received via IPC:', data);
      }
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

    const response = await this.bridge.invoke('request', req);

    if (!isIPCResponse(response)) {
      throw new Error('Invalid response from IPC');
    }

    if (response.error) {
      throw new Error(response.error);
    }

    return response.result as Procedures[P]['output'];
  }

  onRequest(_handler: RequestHandler): void {
    // Handler stored for future use
  }

  private async handleIncomingRequest(req: Request): Promise<void> {
    const registry = getRegistry();

    const sendResponse = (
      response: { id: string; result: unknown } | { id: string; error: string }
    ) => {
      this.bridge.send('response', response);
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
}
