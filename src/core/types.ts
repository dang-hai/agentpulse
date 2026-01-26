/**
 * AgentPulse Core Types
 *
 * Types for exposing React component state and actions to MCP clients.
 */

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
 * Result types for registry operations
 */
export interface GetResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

export interface SetResult {
  success: boolean;
  error?: string;
}

export interface CallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

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
 * Result from the interact tool
 */
export interface InteractResult {
  success: boolean;
  results: Array<SetResult | CallResult>;
  screenshot?: {
    data: string;
    mimeType: string;
    width: number;
    height: number;
  };
  logs?: LogEntry[];
  finalState?: Record<string, unknown>;
  error?: string;
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
