/**
 * AgentPulse Provider
 *
 * Wraps your React app to enable MCP control via useExpose hooks.
 *
 * @example
 * import { AgentPulseProvider } from 'agentpulse';
 *
 * function App() {
 *   return (
 *     <AgentPulseProvider endpoint="ws://localhost:3100/ws">
 *       <MyApp />
 *     </AgentPulseProvider>
 *   );
 * }
 */

import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AgentPulseContext } from '../core/context.js';
import type { Transport } from '../core/protocol.js';
import { WebSocketTransport } from '../transport/websocket.js';

export interface AgentPulseProviderProps {
  /** WebSocket endpoint URL (e.g., 'ws://localhost:3100/ws') */
  endpoint?: string;
  /** Custom transport (for Electron IPC, testing, etc.) */
  transport?: Transport;
  /** Called when connected to server */
  onConnect?: () => void;
  /** Called when disconnected from server */
  onDisconnect?: () => void;
  /** Called on connection error */
  onError?: (error: Error) => void;
  /** Children components */
  children: ReactNode;
}

/**
 * Provider component that enables MCP control for your React app.
 *
 * Use either `endpoint` for WebSocket connection or `transport` for custom transports.
 *
 * @example
 * // WebSocket (browser apps)
 * <AgentPulseProvider endpoint="ws://localhost:3100/ws">
 *   <App />
 * </AgentPulseProvider>
 *
 * @example
 * // Custom transport (Electron, testing)
 * <AgentPulseProvider transport={myTransport}>
 *   <App />
 * </AgentPulseProvider>
 */
export function AgentPulseProvider({
  endpoint,
  transport: customTransport,
  onConnect,
  onDisconnect,
  onError,
  children,
}: AgentPulseProviderProps) {
  const [, setIsConnected] = useState(false);

  // Create transport (either custom or WebSocket)
  const transport = useMemo(() => {
    if (customTransport) {
      return customTransport;
    }
    if (endpoint) {
      return new WebSocketTransport({ url: endpoint });
    }
    return null;
  }, [endpoint, customTransport]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (!transport) return;

    let mounted = true;

    transport
      .connect()
      .then(() => {
        if (mounted) {
          setIsConnected(true);
          onConnect?.();
        }
      })
      .catch((error) => {
        if (mounted) {
          onError?.(error);
        }
      });

    return () => {
      mounted = false;
      setIsConnected(false);
      transport.disconnect().then(() => {
        onDisconnect?.();
      });
    };
  }, [transport, onConnect, onDisconnect, onError]);

  return <AgentPulseContext.Provider value={transport}>{children}</AgentPulseContext.Provider>;
}

/**
 * Hook to access the AgentPulse connection status.
 *
 * @example
 * function StatusIndicator() {
 *   const { isConnected } = useAgentPulse();
 *   return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>;
 * }
 */
export function useAgentPulse() {
  const transport = React.useContext(AgentPulseContext);

  return {
    isConnected: transport?.isConnected() ?? false,
    transport,
  };
}
