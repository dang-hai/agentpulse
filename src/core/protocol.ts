/**
 * Transport Protocol Types
 *
 * Type-safe message protocol for browser ↔ server communication.
 * Used by WebSocket transport, Electron IPC, or any other transport.
 */

import type {
  ExposeInfo,
  DiscoverInfo,
  GetResult,
  SetResult,
  CallResult,
} from './types.js';

// ============================================================================
// Procedure Definitions
// ============================================================================

/**
 * All procedures supported by the transport protocol.
 * Each procedure has typed input and output.
 */
export type Procedures = {
  // Server → Browser (proxy operations)
  list: {
    input: { tag?: string };
    output: ExposeInfo[];
  };
  discover: {
    input: { tag?: string; id?: string };
    output: DiscoverInfo[];
  };
  get: {
    input: { id: string; key: string };
    output: GetResult;
  };
  set: {
    input: { id: string; key: string; value: unknown };
    output: SetResult;
  };
  call: {
    input: { id: string; key: string; args: unknown[] };
    output: CallResult;
  };

  // Browser → Server (registration notifications)
  register: {
    input: { id: string; keys: string[]; description?: string; tags?: string[] };
    output: { success: boolean };
  };
  unregister: {
    input: { id: string };
    output: { success: boolean };
  };
};

export type ProcedureName = keyof Procedures;

// ============================================================================
// Message Types
// ============================================================================

/**
 * Request message sent over the transport
 */
export type Request<P extends ProcedureName = ProcedureName> = {
  id: string;
  method: P;
  params: Procedures[P]['input'];
};

/**
 * Response message sent over the transport
 */
export type Response<P extends ProcedureName = ProcedureName> = {
  id: string;
  result?: Procedures[P]['output'];
  error?: string;
};

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Transport interface for browser ↔ server communication.
 * Implementations: WebSocketTransport, ElectronIPCTransport, LocalTransport
 */
export interface Transport {
  /** Connect to the server */
  connect(): Promise<void>;

  /** Disconnect from the server */
  disconnect(): Promise<void>;

  /** Check if connected */
  isConnected(): boolean;

  /** Send a request and wait for response (typed) */
  request<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']>;

  /** Handle incoming requests (for browser-side) */
  onRequest?(handler: RequestHandler): void;
}

/**
 * Handler for incoming requests (browser-side)
 */
export type RequestHandler = <P extends ProcedureName>(
  method: P,
  params: Procedures[P]['input']
) => Promise<Procedures[P]['output']>;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract input type for a procedure
 */
export type ProcedureInput<P extends ProcedureName> = Procedures[P]['input'];

/**
 * Extract output type for a procedure
 */
export type ProcedureOutput<P extends ProcedureName> = Procedures[P]['output'];
