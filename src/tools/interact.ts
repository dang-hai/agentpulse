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

// Pluggable screenshot and log functions
let screenshotCapture: ScreenshotCapture | null = null;
let logBuffer: LogEntry[] = [];
let logCapturing = false;

/**
 * Configure the screenshot capture function.
 * Call this during app initialization.
 */
export function setScreenshotCapture(capture: ScreenshotCapture): void {
  screenshotCapture = capture;
}

/**
 * Inject a log entry (for log collection during interact)
 */
export function injectLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): void {
  if (logCapturing) {
    logBuffer.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level: entry.level,
      source: entry.source,
      message: entry.message,
      meta: entry.meta,
    });
  }
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
 */
export async function interact(params: InteractInput): Promise<InteractResult> {
  const registry = getRegistry();
  const { target, actions, observe } = params;

  // Check component exists
  if (!registry.has(target)) {
    return {
      success: false,
      results: [],
      error: `Component not found: ${target}`,
    };
  }

  // Start log capture if requested
  if (observe?.logs) {
    logBuffer = [];
    logCapturing = true;
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
      injectLog({
        level: 'warn',
        source: 'interact',
        message: `Timeout waiting for ${key} to become ${JSON.stringify(becomes)}`,
      });
    }
  }

  // Stop log capture
  logCapturing = false;

  // Build response
  const response: InteractResult = {
    success: overallSuccess,
    results,
  };

  // Capture screenshot if requested
  if (observe?.screenshot && screenshotCapture) {
    const screenshot = await screenshotCapture();
    if (screenshot) {
      response.screenshot = screenshot;
    }
  }

  // Include logs if captured
  if (observe?.logs) {
    response.logs = logBuffer;
    logBuffer = [];
  }

  // Include final state
  response.finalState = registry.getState(target) ?? undefined;

  return response;
}
