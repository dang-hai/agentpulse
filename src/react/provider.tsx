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

import React, { type JSX, type ReactNode, useEffect, useRef, useState } from 'react';
import { AgentPulseContext } from '../core/context.js';
import type { Transport } from '../core/protocol.js';
import { createIPCTransport } from '../transport/ipc.js';
import { WebSocketTransport } from '../transport/websocket.js';

export interface UseAgentPulseResult {
  isConnected: boolean;
  transport: Transport | null;
}

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
}: AgentPulseProviderProps): JSX.Element {
  const [, setIsConnected] = useState(false);

  // Use ref to persist transport across StrictMode remounts
  const transportRef = useRef<Transport | null>(null);

  // Create transport once (custom, WebSocket, or IPC auto-detect)
  if (!transportRef.current) {
    if (customTransport) {
      transportRef.current = customTransport;
    } else if (endpoint) {
      transportRef.current = new WebSocketTransport({ url: endpoint });
    } else if (typeof window !== 'undefined' && window.agentpulse) {
      // Auto-detect Electron IPC bridge
      transportRef.current = createIPCTransport();
    }
  }

  const transport = transportRef.current;

  // Help developers debug missing setup in Electron
  useEffect(() => {
    if (!transport && !endpoint && !customTransport) {
      const isElectron =
        typeof window !== 'undefined' &&
        typeof process !== 'undefined' &&
        (process as NodeJS.Process).versions?.electron;
      if (isElectron) {
        console.error(
          '[AgentPulse] Electron detected but window.agentpulse missing. ' +
            'Add setupAgentPulse() to your preload script.'
        );
      }
    }
  }, [transport, endpoint, customTransport]);

  // Track if we should disconnect (prevents StrictMode double-mount issues)
  const shouldDisconnectRef = useRef(false);

  // Connect on mount, disconnect only on true unmount
  useEffect(() => {
    if (!transport) return;

    shouldDisconnectRef.current = false;

    transport
      .connect()
      .then(() => {
        if (!shouldDisconnectRef.current) {
          setIsConnected(true);
          onConnect?.();
        }
      })
      .catch((error) => {
        if (!shouldDisconnectRef.current) {
          onError?.(error);
        }
      });

    return () => {
      shouldDisconnectRef.current = true;
      // Delay disconnect to survive StrictMode remount
      setTimeout(() => {
        if (shouldDisconnectRef.current) {
          setIsConnected(false);
          transport.disconnect().then(() => {
            onDisconnect?.();
          });
        }
      }, 100);
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
export function useAgentPulse(): UseAgentPulseResult {
  const transport = React.useContext(AgentPulseContext);

  return {
    isConnected: transport?.isConnected() ?? false,
    transport: transport,
  };
}
