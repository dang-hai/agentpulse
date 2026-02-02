/**
 * AgentPulse React Context
 *
 * Provides transport access to hooks throughout the component tree.
 */

import { type Context, createContext } from 'react';
import type { ClientTransport } from './transport/base.js';
import type { HttpTransport } from './transport/http.js';

/**
 * AgentPulse context value
 */
export interface AgentPulseContextValue {
  /** Transport for registry operations */
  transport: ClientTransport | null;
  /** HTTP transport for agent operations (only in hosted mode) */
  httpTransport: HttpTransport | null;
  /** Whether the transport is connected */
  isConnected: boolean;
}

/**
 * Default context value
 */
const defaultValue: AgentPulseContextValue = {
  transport: null,
  httpTransport: null,
  isConnected: false,
};

/**
 * Context for providing transport to useExpose and useAgent hooks.
 * When null transport, useExpose only registers to the local registry.
 */
export const AgentPulseContext: Context<AgentPulseContextValue> =
  createContext<AgentPulseContextValue>(defaultValue);
