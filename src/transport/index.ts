/**
 * AgentPulse Transport Layer
 *
 * Transport implementations for browser ↔ server communication.
 */

export { type AgentPulseBridge, createIPCTransport, IPCTransport } from './ipc.js';
export { WebSocketTransport, type WebSocketTransportOptions } from './websocket.js';
