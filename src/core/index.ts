/**
 * AgentPulse Core
 *
 * React hooks and utilities for exposing component state to MCP clients.
 */

export { useExpose, useExposeId, expose } from './useExpose.js';
export { ExposeRegistry, getRegistry, resetRegistry } from './registry.js';
export { AgentPulseContext } from './context.js';

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
  ScreenshotCapture,
} from './types.js';

// Protocol types
export type {
  Transport,
  Procedures,
  ProcedureName,
  Request,
  Response,
  RequestHandler,
  ProcedureInput,
  ProcedureOutput,
} from './protocol.js';
