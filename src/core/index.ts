/**
 * AgentPulse Core
 *
 * React hooks and utilities for exposing component state to MCP clients.
 */

export { AgentPulseContext } from './context.js';
// Protocol types
export type {
  ProcedureInput,
  ProcedureName,
  ProcedureOutput,
  Procedures,
  Request,
  RequestHandler,
  Response,
  Transport,
} from './protocol.js';
export { ExposeRegistry, getRegistry, resetRegistry } from './registry.js';

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
  ScreenshotCapture,
  SetResult,
} from './types.js';
export { expose, useExpose, useExposeId } from './useExpose.js';
