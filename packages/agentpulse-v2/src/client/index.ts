/**
 * AgentPulse Client SDK
 *
 * React hooks and components for making apps controllable by MCP clients.
 */

// Provider
export { AgentPulse, useAgentPulse, type AgentPulseProps } from './AgentPulse.js';

// Hooks
export { useAgent, type UseAgentReturn } from './useAgent.js';
export { expose, useExpose, useExposeId } from './useExpose.js';

// Context (for advanced use cases)
export { AgentPulseContext, type AgentPulseContextValue } from './context.js';

// Transport
export {
  HttpTransport,
  WebSocketTransport,
  type ClientTransport,
  type HttpTransportOptions,
  type TransportOptions,
  type WebSocketTransportOptions,
} from './transport/index.js';
