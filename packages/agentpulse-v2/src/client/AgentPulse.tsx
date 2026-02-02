/**
 * AgentPulse Provider
 *
 * Unified provider component for AgentPulse.
 * Supports both self-hosted (WebSocket) and hosted (HTTP) modes.
 *
 * @example
 * // Hosted mode (with API key)
 * import { AgentPulse } from 'agentpulse-v2';
 *
 * function App() {
 *   return (
 *     <AgentPulse apiKey="ap_xxx">
 *       <MyApp />
 *     </AgentPulse>
 *   );
 * }
 *
 * @example
 * // Self-hosted mode (with endpoint)
 * import { AgentPulse } from 'agentpulse-v2';
 *
 * function App() {
 *   return (
 *     <AgentPulse endpoint="ws://localhost:3100/ws">
 *       <MyApp />
 *     </AgentPulse>
 *   );
 * }
 */

import React, { type JSX, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPulseContext, type AgentPulseContextValue } from './context.js';
import type { ClientTransport } from './transport/base.js';
import { HttpTransport } from './transport/http.js';
import { WebSocketTransport } from './transport/websocket.js';

export interface AgentPulseProps {
  /** API key for hosted mode (uses HTTP transport) */
  apiKey?: string;
  /** WebSocket endpoint URL for self-hosted mode (e.g., 'ws://localhost:3100/ws') */
  endpoint?: string;
  /** Custom transport (for testing, Electron IPC, etc.) */
  transport?: ClientTransport;
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
 * Unified provider component for AgentPulse.
 *
 * Use `apiKey` for hosted mode (HTTP transport with SSE streaming).
 * Use `endpoint` for self-hosted mode (WebSocket transport).
 * Use `transport` for custom transports (testing, Electron, etc.).
 *
 * @example
 * // Hosted mode - full agent capabilities
 * <AgentPulse apiKey="ap_xxx">
 *   <App />
 * </AgentPulse>
 *
 * @example
 * // Self-hosted mode - MCP tools only
 * <AgentPulse endpoint="ws://localhost:3100/ws">
 *   <App />
 * </AgentPulse>
 *
 * @example
 * // Custom transport (testing)
 * <AgentPulse transport={mockTransport}>
 *   <App />
 * </AgentPulse>
 */
export function AgentPulse({
  apiKey,
  endpoint,
  transport: customTransport,
  onConnect,
  onDisconnect,
  onError,
  children,
}: AgentPulseProps): JSX.Element {
  const [isConnected, setIsConnected] = useState(false);

  // Use ref to persist transport across StrictMode remounts
  const transportRef = useRef<ClientTransport | null>(null);
  const httpTransportRef = useRef<HttpTransport | null>(null);

  // Create transport once
  if (!transportRef.current) {
    if (customTransport) {
      transportRef.current = customTransport;
    } else if (apiKey) {
      // Hosted mode: use HTTP transport
      const http = new HttpTransport({ apiKey });
      transportRef.current = http;
      httpTransportRef.current = http;
    } else if (endpoint) {
      // Self-hosted mode: use WebSocket transport
      transportRef.current = new WebSocketTransport({ url: endpoint });
    }
  }

  const transport = transportRef.current;
  const httpTransport = httpTransportRef.current;

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

  // Memoize context value
  const contextValue: AgentPulseContextValue = useMemo(
    () => ({
      transport,
      httpTransport,
      isConnected,
    }),
    [transport, httpTransport, isConnected]
  );

  return <AgentPulseContext.Provider value={contextValue}>{children}</AgentPulseContext.Provider>;
}

/**
 * Hook to access AgentPulse connection status.
 *
 * @example
 * function StatusIndicator() {
 *   const { isConnected } = useAgentPulse();
 *   return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>;
 * }
 */
export function useAgentPulse() {
  const context = React.useContext(AgentPulseContext);
  return {
    isConnected: context.isConnected,
    transport: context.transport,
  };
}
