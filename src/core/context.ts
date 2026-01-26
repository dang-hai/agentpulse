/**
 * AgentPulse React Context
 *
 * Provides transport access to useExpose hooks throughout the component tree.
 */

import { type Context, createContext } from 'react';
import type { Transport } from './protocol.js';

/**
 * Context for providing transport to useExpose hooks.
 * When null, useExpose only registers to the local registry (no server communication).
 */
export const AgentPulseContext: Context<Transport | null> = createContext<Transport | null>(null);
