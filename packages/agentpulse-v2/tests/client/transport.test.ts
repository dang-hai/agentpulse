/**
 * Transport Tests
 *
 * Tests for HTTP and WebSocket transports.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { HttpTransport, type HttpTransportOptions } from '../../src/client/transport/http.js';
import { WebSocketTransport, type WebSocketTransportOptions } from '../../src/client/transport/websocket.js';

describe('HttpTransport', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should initialize with correct options', () => {
    const transport = new HttpTransport({ apiKey: 'test-key' });
    expect(transport.isConnected()).toBe(false);
  });

  it('should connect successfully when health check passes', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    );

    const transport = new HttpTransport({ apiKey: 'test-key' });
    await transport.connect();

    expect(transport.isConnected()).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.agentpulse.dev/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  it('should throw on connection failure', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))
    );

    const transport = new HttpTransport({ apiKey: 'bad-key' });

    await expect(transport.connect()).rejects.toThrow('Connection failed: 401');
    expect(transport.isConnected()).toBe(false);
  });

  it('should handle connection timeout', async () => {
    global.fetch = mock(() =>
      new Promise((_, reject) => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      })
    );

    const transport = new HttpTransport({
      apiKey: 'test-key',
      connectionTimeout: 50,
    });

    await expect(transport.connect()).rejects.toThrow('Connection timeout');
  });

  it('should disconnect and clear state', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    );

    const transport = new HttpTransport({ apiKey: 'test-key' });
    await transport.connect();
    expect(transport.isConnected()).toBe(true);

    await transport.disconnect();
    expect(transport.isConnected()).toBe(false);
  });

  it('should make RPC requests', async () => {
    global.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result: [{ id: 'test', keys: ['value'] }] }), {
          status: 200,
        })
      )
    );

    const transport = new HttpTransport({ apiKey: 'test-key' });
    await transport.connect();

    const result = await transport.request('list', {});

    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://api.agentpulse.dev/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ method: 'list', params: {} }),
      })
    );
    expect(result).toEqual([{ id: 'test', keys: ['value'] }]);
  });

  it('should throw on request when not connected', async () => {
    const transport = new HttpTransport({ apiKey: 'test-key' });

    await expect(transport.request('list', {})).rejects.toThrow('Not connected');
  });

  it('should run agent', async () => {
    const mockResult = {
      success: true,
      messages: [{ role: 'assistant', content: 'Done' }],
      finalResponse: 'Task completed',
      toolCallCount: 1,
    };

    // First call for connect (health check), second for runAgent
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(mockResult), { status: 200 }));
    });

    const transport = new HttpTransport({ apiKey: 'test-key' });
    await transport.connect();

    const result = await transport.runAgent('Click the button');

    expect(result).toEqual(mockResult);
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://api.agentpulse.dev/agent/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'Click the button', config: undefined }),
      })
    );
  });

  it('should use custom base URL', async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    );

    const transport = new HttpTransport({
      apiKey: 'test-key',
      baseUrl: 'https://custom.api.dev',
    });
    await transport.connect();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://custom.api.dev/health',
      expect.anything()
    );
  });
});

describe('WebSocketTransport', () => {
  it('should initialize with correct options', () => {
    const transport = new WebSocketTransport({ url: 'ws://localhost:3100/ws' });
    expect(transport.isConnected()).toBe(false);
  });

  it('should have default options', () => {
    const transport = new WebSocketTransport({ url: 'ws://localhost:3100/ws' });
    // Just verify it doesn't throw
    expect(transport).toBeDefined();
  });

  it('should throw when making request while disconnected', async () => {
    const transport = new WebSocketTransport({ url: 'ws://localhost:3100/ws' });

    await expect(transport.request('list', {})).rejects.toThrow('Not connected');
  });
});
