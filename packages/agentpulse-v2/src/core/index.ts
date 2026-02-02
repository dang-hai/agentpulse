/**
 * AgentPulse Core
 *
 * Core types, registry, and tool definitions.
 */

// Constants
export {
  DEFAULT_MAX_TURNS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  HOSTED_API_URL,
  HOSTED_WS_URL,
} from './constants.js';

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

// Registry
export { ExposeRegistry, getRegistry, resetRegistry } from './registry.js';

// Tool definitions
export type {
  CallInput,
  DiscoverInput,
  GetInput,
  InteractAction,
  InteractInput,
  ListInput,
  SetInput,
  ToolDefinition,
  ToolName,
} from './tools.js';
export { allTools, toolDefinitions } from './tools.js';

// Types
export type {
  AgentConfig,
  AgentMessage,
  AgentPulseBridge,
  AgentRunResult,
  AgentStreamEvent,
  Bindings,
  BindingValue,
  CallResult,
  DiscoverInfo,
  ExposeEntry,
  ExposeInfo,
  ExposeOptions,
  GetResult,
  InteractOptions,
  InteractResult,
  LogEntry,
  Result,
  ScreenshotCapture,
  SetResult,
  ToolCall,
  ToolResult,
} from './types.js';
export { isFailure, isSuccess } from './types.js';
