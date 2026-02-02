/**
 * useExpose Hook Tests
 *
 * Tests for the useExpose hook that registers component state to the registry.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { useExpose, useExposeId, expose } from '../../src/client/useExpose.js';
import { getRegistry, resetRegistry } from '../../src/core/registry.js';
import { AgentPulseContext, type AgentPulseContextValue } from '../../src/client/context.js';

describe('useExpose', () => {
  beforeEach(() => {
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  it('should register bindings to the registry', async () => {
    const bindings = {
      value: 'test',
      setValue: () => {},
    };

    const { unmount } = renderHook(() => useExpose('test-id', bindings));

    // Wait for useEffect to run
    await waitFor(() => {
      const registry = getRegistry();
      expect(registry.has('test-id')).toBe(true);
    });

    const registry = getRegistry();
    const info = registry.discover({ id: 'test-id' });
    expect(info.length).toBe(1);
    expect(info[0].keys).toContain('value');
    expect(info[0].keys).toContain('setValue');

    unmount();

    // Wait for cleanup
    await waitFor(() => {
      expect(registry.has('test-id')).toBe(false);
    });
  });

  it('should support description and tags options', async () => {
    const { unmount } = renderHook(() =>
      useExpose(
        'with-options',
        { value: 'test' },
        {
          description: 'Test component',
          tags: ['input', 'form'],
        }
      )
    );

    await waitFor(() => {
      const registry = getRegistry();
      const info = registry.discover({ id: 'with-options' });
      expect(info.length).toBe(1);
    });

    const registry = getRegistry();
    const info = registry.discover({ id: 'with-options' });
    expect(info[0].description).toBe('Test component');
    expect(info[0].tags).toEqual(['input', 'form']);

    unmount();
  });

  it('should keep bindings fresh via proxy', async () => {
    let currentValue = 'initial';

    const { rerender } = renderHook(
      ({ value }) => useExpose('proxy-test', { value, getValue: () => value }),
      { initialProps: { value: currentValue } }
    );

    const registry = getRegistry();

    await waitFor(() => {
      expect(registry.has('proxy-test')).toBe(true);
    });

    // Check initial value
    let result = registry.get('proxy-test', 'value');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('initial');
    }

    // Update value and rerender
    currentValue = 'updated';
    rerender({ value: currentValue });

    // Check updated value (proxy should provide fresh value)
    result = registry.get('proxy-test', 'value');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('updated');
    }
  });

  it('should call transport.request on registration when connected', async () => {
    const mockRequest = mock(() => Promise.resolve({ success: true }));
    const mockTransport = {
      connect: mock(() => Promise.resolve()),
      disconnect: mock(() => Promise.resolve()),
      isConnected: () => true,
      request: mockRequest,
    };

    const contextValue: AgentPulseContextValue = {
      transport: mockTransport,
      httpTransport: null,
      isConnected: true,
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentPulseContext.Provider value={contextValue}>{children}</AgentPulseContext.Provider>
    );

    const { unmount } = renderHook(() => useExpose('transport-test', { value: 'test' }), {
      wrapper,
    });

    // Wait for async registration
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalled();
    });

    expect(mockRequest).toHaveBeenCalledWith('register', {
      id: 'transport-test',
      keys: ['value'],
      description: undefined,
      tags: [],
    });

    unmount();

    // Wait for unregister
    await waitFor(() => {
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    expect(mockRequest).toHaveBeenCalledWith('unregister', { id: 'transport-test' });
  });

  it('should handle registration errors gracefully', async () => {
    const onRegistrationError = mock(() => {});
    const mockRequest = mock(() => Promise.reject(new Error('Registration failed')));
    const mockTransport = {
      connect: mock(() => Promise.resolve()),
      disconnect: mock(() => Promise.resolve()),
      isConnected: () => true,
      request: mockRequest,
    };

    const contextValue: AgentPulseContextValue = {
      transport: mockTransport,
      httpTransport: null,
      isConnected: true,
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AgentPulseContext.Provider value={contextValue}>{children}</AgentPulseContext.Provider>
    );

    const consoleSpy = spyOn(console, 'warn').mockImplementation(() => {});

    renderHook(
      () => useExpose('error-test', { value: 'test' }, { onRegistrationError }),
      { wrapper }
    );

    // Wait for async registration error
    await waitFor(() => {
      expect(onRegistrationError).toHaveBeenCalled();
    });

    consoleSpy.mockRestore();
  });
});

describe('useExposeId', () => {
  it('should generate unique IDs with prefix', () => {
    const { result: result1 } = renderHook(() => useExposeId('todo-item'));
    const { result: result2 } = renderHook(() => useExposeId('todo-item'));

    expect(result1.current).toBeTruthy();
    expect(result2.current).toBeTruthy();
    expect(typeof result1.current).toBe('string');
    expect(result1.current.startsWith('todo-item:')).toBe(true);
    expect(result2.current.startsWith('todo-item:')).toBe(true);
    expect(result1.current).not.toBe(result2.current);
  });
});

describe('expose (non-hook)', () => {
  beforeEach(() => {
    resetRegistry();
  });

  afterEach(() => {
    resetRegistry();
  });

  it('should register bindings and return unregister function', () => {
    const unregister = expose('non-hook-test', {
      isConnected: { get: () => true, set: () => {} },
      reconnect: () => {},
    });

    const registry = getRegistry();
    expect(registry.has('non-hook-test')).toBe(true);

    unregister();
    expect(registry.has('non-hook-test')).toBe(false);
  });

  it('should support description and tags', () => {
    const unregister = expose(
      'service-test',
      { status: 'running' },
      { description: 'A service', tags: ['service'] }
    );

    const registry = getRegistry();
    const info = registry.discover({ id: 'service-test' });
    expect(info[0].description).toBe('A service');
    expect(info[0].tags).toEqual(['service']);

    unregister();
  });
});
