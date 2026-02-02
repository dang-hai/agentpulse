/**
 * HTTP/SSE Transport
 *
 * HTTP transport for hosted AgentPulse API.
 * Uses POST for requests and Server-Sent Events for streaming.
 */

import type {
  AgentMessage,
  AgentRunResult,
  AgentStreamEvent,
  AgentConfig,
} from '../../core/types.js';
import { HOSTED_API_URL } from '../../core/constants.js';
import type { ClientTransport, TransportOptions } from './base.js';
import type { ProcedureName, Procedures, RequestHandler } from '../../core/protocol.js';

export interface HttpTransportOptions extends TransportOptions {
  /** API key for authentication */
  apiKey: string;
  /** API base URL (default: hosted API) */
  baseUrl?: string;
}

/**
 * HTTP transport for hosted AgentPulse API.
 * Primarily used for agent execution (runAgent, streamAgent).
 *
 * @example
 * const transport = new HttpTransport({ apiKey: 'ap_xxx' });
 * await transport.connect();
 */
export class HttpTransport implements ClientTransport {
  private options: Required<HttpTransportOptions>;
  private connected = false;
  private abortController: AbortController | null = null;

  constructor(options: HttpTransportOptions) {
    this.options = {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? HOSTED_API_URL,
      connectionTimeout: options.connectionTimeout ?? 5000,
    };
  }

  async connect(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.connectionTimeout);

    try {
      const response = await fetch(`${this.options.baseUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Connection failed: ${response.status}`);
      }

      this.connected = true;
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Connection timeout');
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async request<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const response = await fetch(`${this.options.baseUrl}/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({ method, params }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    return data.result;
  }

  onRequest(_handler: RequestHandler): void {
    // Not used for HTTP transport
  }

  /**
   * Run an agent with a prompt (blocking).
   */
  async runAgent(prompt: string, config?: AgentConfig): Promise<AgentRunResult> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    const response = await fetch(`${this.options.baseUrl}/agent/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({ prompt, config }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Agent run failed: ${response.status} - ${text}`);
    }

    return response.json();
  }

  /**
   * Stream agent execution with SSE.
   */
  async *streamAgent(
    prompt: string,
    config?: AgentConfig
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    this.abortController = new AbortController();

    const response = await fetch(`${this.options.baseUrl}/agent/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ prompt, config }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Agent stream failed: ${response.status} - ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const event = JSON.parse(data) as AgentStreamEvent;
              yield event;
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.abortController = null;
    }
  }

  /**
   * Stop the current streaming agent execution.
   */
  stopAgent(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
