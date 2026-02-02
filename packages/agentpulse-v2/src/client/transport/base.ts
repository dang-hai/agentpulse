/**
 * Transport Interface
 *
 * Base interface for browser <-> server communication.
 * Implementations: WebSocketTransport, HttpTransport
 */

import type { ProcedureName, Procedures, RequestHandler } from '../../core/protocol.js';

/**
 * Transport interface for browser <-> server communication.
 */
export interface ClientTransport {
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
 * Base transport options
 */
export interface TransportOptions {
  /** Connection timeout in ms (default: 5000) */
  connectionTimeout?: number;
}
