/**
 * Interact Tool
 *
 * Compound tool that bundles multiple actions with automatic observation.
 * Reduces round trips: instead of 4-5 tool calls, do it in 1.
 *
 * Example:
 *   interact({
 *     target: 'chat-input',
 *     actions: [
 *       { set: { value: 'Hello world' } },
 *       { call: 'send' }
 *     ],
 *     observe: {
 *       screenshot: true,
 *       logs: true,
 *       waitFor: { key: 'isStreaming', becomes: false, timeout: 5000 }
 *     }
 *   })
 *
 * Returns action results + screenshot + logs + final state in one response.
 */

import { z } from 'zod';
import { getRegistry } from '../core/registry.js';
import type {
  CallResult,
  InteractResult,
  LogEntry,
  ScreenshotCapture,
  SetResult,
} from '../core/types.js';

// Schema for the interact tool
export const interactSchema = z.object({
  target: z.string().describe('Component ID to interact with'),
  actions: z
    .array(
      z.union([
        z.object({
          set: z.record(z.unknown()).describe('Key-value pairs to set'),
        }),
        z.object({
          call: z.string().describe('Action name to call'),
          args: z.array(z.unknown()).optional().describe('Arguments for the action'),
        }),
      ])
    )
    .describe('Actions to execute in sequence'),
  observe: z
    .object({
      screenshot: z.boolean().optional().describe('Capture screenshot after actions'),
      logs: z.boolean().optional().describe('Collect logs during execution'),
      waitFor: z
        .object({
          key: z.string().describe('State key to watch'),
          becomes: z.unknown().describe('Value to wait for'),
          timeout: z.number().optional().describe('Timeout in ms (default: 5000)'),
        })
        .optional()
        .describe('Wait for a state condition after actions'),
    })
    .optional()
    .describe('Observation options'),
});

export type InteractInput = z.infer<typeof interactSchema>;

/**
 * Context for interact execution.
 * Each interact() call gets its own context, making it safe for concurrent use.
 */
export interface InteractContext {
  /** Function to capture screenshots (optional) */
  captureScreenshot?: ScreenshotCapture;
  /** Function to inject logs into the current context */
  injectLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
}

/**
 * Create an interact context for a single execution.
 * The returned context is isolated - logs and state don't leak between calls.
 */
export function createInteractContext(options?: {
  captureScreenshot?: ScreenshotCapture;
}): InteractContext & { getLogs: () => LogEntry[] } {
  const logs: LogEntry[] = [];

  return {
    captureScreenshot: options?.captureScreenshot,
    injectLog: (entry) => {
      logs.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        level: entry.level,
        source: entry.source,
        message: entry.message,
        meta: entry.meta,
      });
    },
    getLogs: () => logs,
  };
}

// Default context for backward compatibility
// Apps can call setDefaultScreenshotCapture() to configure screenshot support
let defaultScreenshotCapture: ScreenshotCapture | undefined;

/**
 * Configure the default screenshot capture function.
 * This is used when interact() is called without an explicit context.
 */
export function setDefaultScreenshotCapture(capture: ScreenshotCapture | undefined): void {
  defaultScreenshotCapture = capture;
}

/**
 * Wait for a state condition with polling
 */
async function waitForCondition(
  target: string,
  key: string,
  expectedValue: unknown,
  timeout: number
): Promise<boolean> {
  const registry = getRegistry();
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeout) {
    const result = registry.get(target, key);
    if (result.success && result.value === expectedValue) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Execute multiple actions on a component with automatic observation.
 *
 * @param params - The interact parameters (target, actions, observe options)
 * @param context - Optional context for screenshots and logging (creates isolated context if not provided)
 */
export async function interact(
  params: InteractInput,
  context?: InteractContext & { getLogs?: () => LogEntry[] }
): Promise<InteractResult> {
  const registry = getRegistry();
  const { target, actions, observe } = params;

  // Create isolated context if not provided
  const ctx = context ?? createInteractContext({ captureScreenshot: defaultScreenshotCapture });
  const getLogs = context?.getLogs ?? (ctx as ReturnType<typeof createInteractContext>).getLogs;

  // Check component exists
  if (!registry.has(target)) {
    return {
      success: false,
      results: [],
      error: `Component not found: ${target}`,
    };
  }

  const results: Array<SetResult | CallResult> = [];
  let overallSuccess = true;

  // Execute actions sequentially
  for (const action of actions) {
    if ('set' in action) {
      for (const [key, value] of Object.entries(action.set)) {
        const result = registry.set(target, key, value);
        results.push(result);
        if (!result.success) {
          overallSuccess = false;
        }
      }
    } else if ('call' in action) {
      const result = await registry.call(target, action.call, action.args ?? []);
      results.push(result);
      if (!result.success) {
        overallSuccess = false;
      }
    }
  }

  // Wait for condition if specified
  if (observe?.waitFor && overallSuccess) {
    const { key, becomes, timeout = 5000 } = observe.waitFor;
    const conditionMet = await waitForCondition(target, key, becomes, timeout);
    if (!conditionMet) {
      ctx.injectLog({
        level: 'warn',
        source: 'interact',
        message: `Timeout waiting for ${key} to become ${JSON.stringify(becomes)}`,
      });
    }
  }

  // Build response
  const response: InteractResult = {
    success: overallSuccess,
    results,
  };

  // Capture screenshot if requested
  if (observe?.screenshot && ctx.captureScreenshot) {
    const screenshot = await ctx.captureScreenshot();
    if (screenshot) {
      response.screenshot = screenshot;
    }
  }

  // Include logs if captured
  if (observe?.logs && getLogs) {
    response.logs = getLogs();
  }

  // Include final state
  const finalState = registry.getState(target);
  if (finalState) {
    response.finalState = finalState;
  }

  return response;
}
