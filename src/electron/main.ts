/**
 * AgentPulse Electron Main Process Server
 *
 * Creates an MCP server that communicates with renderers via IPC.
 *
 * @example
 * // main.ts
 * import { ipcMain } from 'electron';
 * import { createServer } from 'agentpulse/main';
 *
 * const server = createServer({ ipcMain });
 * await server.start();
 */

import * as http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { ProcedureName, Procedures, Request, Response } from '../core/protocol.js';

function isRequest(value: unknown): value is Request {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'method' in value &&
    typeof value.method === 'string' &&
    'params' in value
  );
}

function isResponse(value: unknown): value is Response {
  return (
    typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
  );
}

// Electron types (peer dependency)
interface WebContents {
  id: number;
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): this;
}

interface IpcMainEvent {
  sender: WebContents;
}

interface IpcMainInvokeEvent {
  sender: WebContents;
}

interface IpcMain {
  on(channel: string, listener: (event: IpcMainEvent, ...args: unknown[]) => void): this;
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>
  ): void;
}

export interface ElectronServerOptions {
  /** Electron's ipcMain module */
  ipcMain: IpcMain;
  /** Base channel name (default: 'agentpulse') */
  channel?: string;
  /** HTTP port for MCP endpoint (default: 3100) */
  port?: number;
  /** HTTP host (default: 'localhost') */
  host?: string;
  /** MCP endpoint path (default: '/mcp') */
  path?: string;
  /** Server name for MCP (default: 'agentpulse') */
  name?: string;
  /** Server version (default: '1.0.0') */
  version?: string;
}

interface RendererConnection {
  webContents: WebContents;
  components: Map<string, { keys: string[]; description?: string; tags?: string[] }>;
}

/**
 * AgentPulse Electron MCP Server
 *
 * Exposes your Electron app to MCP clients via HTTP.
 * Communicates with renderer processes via IPC.
 */
export class ElectronServer {
  private httpServer: http.Server | null = null;
  private connections = new Map<number, RendererConnection>();
  private pending = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private options: Required<Omit<ElectronServerOptions, 'ipcMain'>> & { ipcMain: IpcMain };

  constructor(options: ElectronServerOptions) {
    this.options = {
      ipcMain: options.ipcMain,
      channel: options.channel ?? 'agentpulse',
      port: options.port ?? 3100,
      host: options.host ?? 'localhost',
      path: options.path ?? '/mcp',
      name: options.name ?? 'agentpulse',
      version: options.version ?? '1.0.0',
    };
  }

  private setupIpcHandlers(): void {
    const { ipcMain, channel } = this.options;

    ipcMain.on(`${channel}:connect`, (event: IpcMainEvent) => {
      const webContents = event.sender;
      const id = webContents.id;

      console.log(`[AgentPulse] Renderer ${id} connected`);

      this.connections.set(id, {
        webContents,
        components: new Map(),
      });

      webContents.once('destroyed', () => {
        console.log(`[AgentPulse] Renderer ${id} disconnected`);
        this.connections.delete(id);
      });
    });

    ipcMain.on(`${channel}:disconnect`, (event: IpcMainEvent) => {
      const id = event.sender.id;
      console.log(`[AgentPulse] Renderer ${id} disconnected`);
      this.connections.delete(id);
    });

    ipcMain.handle(`${channel}:request`, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const req = args[0];
      if (!isRequest(req)) {
        return { error: 'Invalid request format' };
      }

      const connection = this.connections.get(event.sender.id);
      if (!connection) {
        return { error: 'Renderer not connected' };
      }

      if (req.method === 'register') {
        const params = req.params as Procedures['register']['input'];
        connection.components.set(params.id, {
          keys: params.keys,
          description: params.description,
          tags: params.tags,
        });
        return { result: { success: true } };
      }

      if (req.method === 'unregister') {
        const params = req.params as Procedures['unregister']['input'];
        connection.components.delete(params.id);
        return { result: { success: true } };
      }

      return { error: `Unexpected request method: ${req.method}` };
    });

    ipcMain.on(`${channel}:response`, (_event: IpcMainEvent, ...args: unknown[]) => {
      const response = args[0];
      if (!isResponse(response)) {
        console.error('[AgentPulse] Invalid response format received');
        return;
      }

      const pending = this.pending.get(response.id);
      if (pending) {
        this.pending.delete(response.id);
        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response.result);
        }
      }
    });
  }

  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: this.options.name,
      version: this.options.version,
    });

    this.registerTools(server);

    return server;
  }

  private registerTools(server: McpServer): void {
    server.registerTool(
      'expose_list',
      {
        description:
          'List all exposed components. Use this first to discover what can be controlled.',
        inputSchema: z.object({
          tag: z.string().optional().describe('Filter by tag'),
        }),
      },
      async (args) => {
        const result = await this.proxyRequest('list', args as Procedures['list']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.registerTool(
      'expose_get',
      {
        description: 'Get a value from an exposed component.',
        inputSchema: z.object({
          id: z.string().describe('Component ID (e.g., "chat-input")'),
          key: z.string().describe('Key to get (e.g., "value", "isLoading")'),
        }),
      },
      async (args) => {
        const result = await this.proxyRequest('get', args as Procedures['get']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.registerTool(
      'expose_set',
      {
        description: 'Set a value on an exposed component.',
        inputSchema: z.object({
          id: z.string().describe('Component ID'),
          key: z.string().describe('Key to set (must be a setter or accessor)'),
          value: z.unknown().describe('Value to set'),
        }),
      },
      async (args) => {
        const result = await this.proxyRequest('set', args as Procedures['set']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.registerTool(
      'expose_call',
      {
        description: 'Call an action on an exposed component.',
        inputSchema: z.object({
          id: z.string().describe('Component ID'),
          key: z.string().describe('Action to call (e.g., "send", "clear")'),
          args: z.array(z.unknown()).optional().describe('Arguments to pass'),
        }),
      },
      async (args) => {
        const input = args as { id: string; key: string; args?: unknown[] };
        const result = await this.proxyRequest('call', {
          id: input.id,
          key: input.key,
          args: input.args ?? [],
        });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.registerTool(
      'discover',
      {
        description:
          'Discover components with rich info including current state and description. ' +
          'Use this instead of expose_list when you want to understand and act quickly.',
        inputSchema: z.object({
          tag: z.string().optional().describe('Filter by tag'),
          id: z.string().optional().describe('Filter to specific component ID'),
        }),
      },
      async (args) => {
        const result = await this.proxyRequest('discover', args as Procedures['discover']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    server.registerTool(
      'interact',
      {
        description:
          'Execute multiple actions on a component. ' +
          'Bundles set/call actions in a single call to reduce round trips.',
        inputSchema: z.object({
          target: z.string().describe('Component ID to interact with'),
          actions: z
            .array(
              z.union([
                z.object({ set: z.record(z.unknown()).describe('Key-value pairs to set') }),
                z.object({
                  call: z.string().describe('Action name to call'),
                  args: z.array(z.unknown()).optional().describe('Arguments for the action'),
                }),
              ])
            )
            .describe('Actions to execute in sequence'),
        }),
      },
      async (args) => {
        const { target, actions } = args as {
          target: string;
          actions: Array<{ set?: Record<string, unknown> } | { call: string; args?: unknown[] }>;
        };

        const results: Array<{ success: boolean; error?: string; result?: unknown }> = [];

        for (const action of actions) {
          if ('set' in action && action.set) {
            for (const [key, value] of Object.entries(action.set)) {
              const result = await this.proxyRequest('set', { id: target, key, value });
              results.push(result);
            }
          } else if ('call' in action) {
            const result = await this.proxyRequest('call', {
              id: target,
              key: action.call,
              args: action.args ?? [],
            });
            results.push(result);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: results.every((r) => r.success),
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  }

  private async proxyRequest<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']> {
    const connection = this.connections.values().next().value as RendererConnection | undefined;

    if (!connection) {
      if (method === 'list' || method === 'discover') {
        return [] as Procedures[P]['output'];
      }
      return {
        success: false,
        error:
          'No renderer connected. Make sure your Electron app is running with AgentPulseProvider.',
      } as Procedures[P]['output'];
    }

    const id = crypto.randomUUID();
    const request: Request<P> = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result as Procedures[P]['output']);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      connection.webContents.send(`${this.options.channel}:request`, request);
    });
  }

  async start(): Promise<void> {
    const { host, port, path } = this.options;

    this.setupIpcHandlers();

    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url !== path) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const mcpServer = this.createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res);

        res.on('close', async () => {
          try {
            await transport.close();
            await mcpServer.close();
          } catch {
            // Ignore cleanup errors
          }
        });
      } catch {
        try {
          await transport.close();
          await mcpServer.close();
        } catch {
          // Ignore cleanup errors
        }

        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            })
          );
        }
      }
    });

    const server = this.httpServer;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, host, () => {
        console.log(`[AgentPulse] Electron MCP server started at http://${host}:${port}${path}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.connections.clear();

    if (this.httpServer) {
      const server = this.httpServer;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      this.httpServer = null;
      console.log('[AgentPulse] Electron MCP server stopped');
    }
  }

  get url(): string {
    return `http://${this.options.host}:${this.options.port}${this.options.path}`;
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}

/**
 * Create an AgentPulse MCP server for Electron.
 *
 * @example
 * import { ipcMain } from 'electron';
 * import { createServer } from 'agentpulse/main';
 *
 * const server = createServer({ ipcMain });
 * await server.start();
 */
export function createServer(options: ElectronServerOptions): ElectronServer {
  return new ElectronServer(options);
}
