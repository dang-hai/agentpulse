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

// React hooks and utilities
export { useExpose, useExposeId, expose } from './core/useExpose.js';
export { getRegistry, resetRegistry } from './core/registry.js';

// React components
export { AgentPulseProvider, useAgentPulse } from './react/provider.js';
export type { AgentPulseProviderProps } from './react/provider.js';

// Transport
export { WebSocketTransport } from './transport/websocket.js';
export type { WebSocketTransportOptions } from './transport/websocket.js';

// Types
export type {
  Bindings,
  BindingValue,
  ExposeOptions,
  ExposeInfo,
  DiscoverInfo,
  GetResult,
  SetResult,
  CallResult,
  InteractAction,
  InteractOptions,
  InteractResult,
  LogEntry,
} from './core/types.js';

// Protocol types (for custom transport implementations)
export type {
  Transport,
  Procedures,
  ProcedureName,
  Request,
  Response,
  RequestHandler,
} from './core/protocol.js';
