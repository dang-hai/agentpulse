/**
 * AgentPulse Core Types
 *
 * Types for exposing React component state and actions to MCP clients.
 */

/**
 * Discriminated union for operation results.
 * Makes invalid states unrepresentable - success always has value, failure always has error.
 */
export type Result<T> = { success: true; value: T } | { success: false; error: string };

/**
 * Type guard for successful results
 */
export function isSuccess<T>(result: Result<T>): result is { success: true; value: T } {
  return result.success;
}

/**
 * Type guard for failed results
 */
export function isFailure<T>(result: Result<T>): result is { success: false; error: string } {
  return !result.success;
}

/**
 * A binding can be:
 * - A primitive value (read-only state)
 * - A function (callable action)
 * - A getter/setter pair (read-write state)
 */
export type BindingValue =
  | unknown
  | ((...args: unknown[]) => unknown)
  | { get: () => unknown; set: (value: unknown) => void };

/**
 * Map of binding names to their values
 */
export type Bindings = Record<string, BindingValue>;

/**
 * Options for useExpose hook
 */
export interface ExposeOptions {
  /** Human-readable description to help agents understand the component */
  description?: string;
  /** Tags for filtering (e.g., ['input', 'form', 'critical-path']) */
  tags?: string[];
  /** Called when registration with the transport fails (component still works locally) */
  onRegistrationError?: (error: Error) => void;
}

/**
 * Registered expose entry (internal)
 */
export interface ExposeEntry {
  id: string;
  bindings: Bindings;
  description?: string;
  tags: string[];
  registeredAt: number;
}

/**
 * Public info about an exposed component
 */
export interface ExposeInfo {
  id: string;
  keys: string[];
  description?: string;
  tags: string[];
  registeredAt: number;
}

/**
 * Rich discovery info (includes current state)
 */
export interface DiscoverInfo extends ExposeInfo {
  currentState: Record<string, unknown>;
}

/**
 * Result types for registry operations.
 * All use discriminated unions - success requires value, failure requires error.
 */
export type GetResult = Result<unknown>;
export type SetResult = Result<void>;
export type CallResult = Result<unknown>;

/**
 * Action types for the interact tool
 */
export type InteractAction = { set: Record<string, unknown> } | { call: string; args?: unknown[] };

/**
 * Options for the interact tool
 */
export interface InteractOptions {
  target: string;
  actions: InteractAction[];
  observe?: {
    screenshot?: boolean;
    logs?: boolean;
    waitFor?: {
      key: string;
      becomes: unknown;
      timeout?: number;
    };
  };
}

/**
 * Result from the interact tool.
 *
 * Note: Unlike GetResult/SetResult/CallResult, this is NOT a discriminated union because:
 * - `success` means "all actions succeeded", not "operation completed"
 * - `results` is always present (empty array on fatal error)
 * - `error` is only set for fatal errors (component not found), not for action failures
 *
 * To check for failures: if (!result.success) { check result.error or iterate result.results }
 */
export interface InteractResult {
  success: boolean;
  results: Array<SetResult | CallResult>;
  error?: string;
  screenshot?: {
    data: string;
    mimeType: string;
    width: number;
    height: number;
  };
  logs?: LogEntry[];
  finalState?: Record<string, unknown>;
}

/**
 * Log entry
 */
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Screenshot capture function signature
 */
export type ScreenshotCapture = () => Promise<{
  data: string;
  mimeType: string;
  width: number;
  height: number;
} | null>;

/**
 * Bridge interface exposed by Electron preload to renderer.
 * Used by IPC transport to communicate with main process.
 */
export interface AgentPulseBridge {
  send: (channel: string, data: unknown) => void;
  invoke: (channel: string, data: unknown) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
  /**
   * Register a handler for custom tool requests from main process.
   * Returns cleanup function.
   */
  onCustomRequest?: (
    channel: string,
    handler: (payload: unknown) => Promise<unknown> | unknown
  ) => () => void;
}

declare global {
  interface Window {
    agentpulse?: AgentPulseBridge;
  }
}
