/**
 * AgentPulse
 *
 * Make React apps MCP-controllable.
 * Expose component state and actions to AI agents with one line of code.
 *
 * @example
 * // 1. Wrap your app with the provider
 * import { AgentPulseProvider } from 'agentpulse';
 *
 * function App() {
 *   return (
 *     <AgentPulseProvider endpoint="ws://localhost:3100/ws">
 *       <MyApp />
 *     </AgentPulseProvider>
 *   );
 * }
 *
 * @example
 * // 2. Expose components with useExpose
 * import { useExpose } from 'agentpulse';
 *
 * function ChatInput() {
 *   const [value, setValue] = useState('');
 *
 *   useExpose('chat-input', { value, setValue, send: handleSend }, {
 *     description: 'Chat input. Use setValue(text) then send() to send a message.',
 *   });
 *
 *   return <input value={value} onChange={e => setValue(e.target.value)} />;
 * }
 *
 * @example
 * // 3. Start the MCP server (separate process)
 * import { createServer } from 'agentpulse/server';
 *
 * const server = createServer({ port: 3100 });
 * await server.start();
 */

// Binding helpers
export { createScrollBindings, type ScrollBindingsOptions } from './bindings/index.js';
// Protocol types (for custom transport implementations)
export type {
  ProcedureName,
  Procedures,
  Request,
  RequestHandler,
  Response,
  Transport,
} from './core/protocol.js';
export { getRegistry, resetRegistry } from './core/registry.js';
// Types
export type {
  Bindings,
  BindingValue,
  CallResult,
  DiscoverInfo,
  ExposeInfo,
  ExposeOptions,
  GetResult,
  InteractAction,
  InteractOptions,
  InteractResult,
  LogEntry,
  SetResult,
} from './core/types.js';
// React hooks and utilities
export { expose, useExpose, useExposeId } from './core/useExpose.js';
export type { AgentPulseProviderProps } from './react/provider.js';
// React components
export { AgentPulseProvider, useAgentPulse } from './react/provider.js';
export type { WebSocketTransportOptions } from './transport/websocket.js';
// Transport
export { WebSocketTransport } from './transport/websocket.js';
