/**
 * useAgent Hook Tests
 *
 * Tests for the useAgent hook that handles agent execution.
 */

import { describe, it, expect, mock } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { useAgent } from '../../src/client/useAgent.js';
import { AgentPulseContext, type AgentPulseContextValue } from '../../src/client/context.js';
import type { AgentRunResult, AgentStreamEvent } from '../../src/core/types.js';

describe('useAgent', () => {
  const createMockHttpTransport = (overrides = {}) => ({
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => Promise.resolve()),
    isConnected: () => true,
    request: mock(() => Promise.resolve({ success: true })),
    runAgent: mock(() =>
      Promise.resolve<AgentRunResult>({
        success: true,
        messages: [{ role: 'assistant', content: 'Done' }],
        finalResponse: 'Task completed',
        toolCallCount: 1,
      })
    ),
    streamAgent: mock(async function* (): AsyncGenerator<AgentStreamEvent> {
      yield { type: 'start', runId: 'test-run' };
      yield { type: 'text', content: 'Hello' };
      yield {
        type: 'done',
        result: {
          success: true,
          messages: [{ role: 'assistant', content: 'Hello' }],
          finalResponse: 'Hello',
          toolCallCount: 0,
        },
      };
    }),
    stopAgent: mock(() => {}),
    ...overrides,
  });

  const createWrapper = (httpTransport: ReturnType<typeof createMockHttpTransport> | null, isConnected = true) => {
    const contextValue: AgentPulseContextValue = {
      transport: httpTransport,
      httpTransport,
      isConnected,
    };

    return ({ children }: { children: ReactNode }) => (
      <AgentPulseContext.Provider value={contextValue}>{children}</AgentPulseContext.Provider>
    );
  };

  it('should return initial state', () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.run).toBe('function');
    expect(typeof result.current.stream).toBe('function');
    expect(typeof result.current.stop).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should throw error when httpTransport is not available', async () => {
    const wrapper = createWrapper(null, false);

    const { result } = renderHook(() => useAgent(), { wrapper });

    await expect(result.current.run('test prompt')).rejects.toThrow(
      'useAgent requires apiKey'
    );
  });

  it('should throw error when not connected', async () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp, false);

    const { result } = renderHook(() => useAgent(), { wrapper });

    await expect(result.current.run('test prompt')).rejects.toThrow('Not connected');
  });

  it('should run agent and update state', async () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    let runResult: AgentRunResult | undefined;

    await act(async () => {
      runResult = await result.current.run('Click the button');
    });

    expect(mockHttp.runAgent).toHaveBeenCalledWith('Click the button', undefined);
    expect(runResult?.success).toBe(true);
    expect(runResult?.finalResponse).toBe('Task completed');
    expect(result.current.result).toEqual(runResult);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle run errors', async () => {
    const mockHttp = createMockHttpTransport({
      runAgent: mock(() => Promise.reject(new Error('Agent error'))),
    });
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    // The run should reject with the error
    await expect(result.current.run('test')).rejects.toThrow('Agent error');

    // isRunning should be false after error
    expect(result.current.isRunning).toBe(false);
  });

  it('should reset state', async () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    // Run agent first
    await act(async () => {
      await result.current.run('test');
    });

    expect(result.current.result).not.toBeNull();

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should stop agent execution', () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    act(() => {
      result.current.stop();
    });

    expect(mockHttp.stopAgent).toHaveBeenCalled();
    expect(result.current.isRunning).toBe(false);
  });

  it('should stream agent and yield events', async () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    const events: AgentStreamEvent[] = [];

    await act(async () => {
      for await (const event of result.current.stream('Say hello')) {
        events.push(event);
      }
    });

    expect(mockHttp.streamAgent).toHaveBeenCalledWith('Say hello', undefined);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
    expect(events.some((e) => e.type === 'text')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(result.current.isRunning).toBe(false);
  });

  it('should pass config to runAgent', async () => {
    const mockHttp = createMockHttpTransport();
    const wrapper = createWrapper(mockHttp);

    const { result } = renderHook(() => useAgent(), { wrapper });

    const config = { model: 'claude-3-opus', maxTurns: 5 };

    await act(async () => {
      await result.current.run('test', config);
    });

    expect(mockHttp.runAgent).toHaveBeenCalledWith('test', config);
  });
});
