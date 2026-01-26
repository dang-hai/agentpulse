/**
 * AgentPulse MCP Server
 *
 * HTTP server that exposes React app state to MCP clients.
 * Accepts WebSocket connections from browsers and proxies MCP requests.
 */

import * as http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { type WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import type { ProcedureName, Procedures, Request, Response } from '../core/index.js';

export interface AgentPulseServerOptions {
  /** Host to bind to (default: 'localhost') */
  host?: string;
  /** Port to listen on (default: 3100) */
  port?: number;
  /** Path for MCP endpoint (default: '/mcp') */
  path?: string;
  /** Path for WebSocket endpoint (default: '/ws') */
  wsPath?: string;
  /** Server name for MCP (default: 'agentpulse') */
  name?: string;
  /** Server version (default: '1.0.0') */
  version?: string;
}

interface BrowserConnection {
  ws: WebSocket;
  components: Map<string, { keys: string[]; description?: string; tags?: string[] }>;
}

/**
 * AgentPulse MCP Server
 *
 * Exposes your React app to MCP clients via HTTP.
 * Accepts WebSocket connections from browsers running AgentPulseProvider.
 *
 * @example
 * import { createServer } from 'agentpulse/server';
 *
 * const server = createServer({ port: 3100 });
 * await server.start();
 */
export class AgentPulseServer {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private connections = new Map<WebSocket, BrowserConnection>();
  private pending = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private options: Required<AgentPulseServerOptions>;

  constructor(options: AgentPulseServerOptions = {}) {
    this.options = {
      host: options.host ?? 'localhost',
      port: options.port ?? 3100,
      path: options.path ?? '/mcp',
      wsPath: options.wsPath ?? '/ws',
      name: options.name ?? 'agentpulse',
      version: options.version ?? '1.0.0',
    };
  }

  /**
   * Create a fresh McpServer instance with all tools registered.
   */
  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: this.options.name,
      version: this.options.version,
    });

    this.registerTools(server);

    return server;
  }

  private registerTools(server: McpServer): void {
    // expose_list - List all exposed components
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

    // expose_get - Get a value
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

    // expose_set - Set a value
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

    // expose_call - Call an action
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

    // discover - Rich discovery
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

    // interact - Batch operations
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

  /**
   * Proxy a request to a connected browser
   */
  private async proxyRequest<P extends ProcedureName>(
    method: P,
    params: Procedures[P]['input']
  ): Promise<Procedures[P]['output']> {
    // Find a connected browser
    const connection = this.connections.values().next().value as BrowserConnection | undefined;

    if (!connection) {
      // No browser connected - return empty/error result
      if (method === 'list' || method === 'discover') {
        return [] as Procedures[P]['output'];
      }
      return {
        success: false,
        error: 'No browser connected. Make sure your React app is running with AgentPulseProvider.',
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

      connection.ws.send(JSON.stringify(request));
    });
  }

  /**
   * Handle incoming WebSocket message from browser
   */
  private handleBrowserMessage(ws: WebSocket, data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if this is a response to a pending request
      const pendingRequest = 'id' in message ? this.pending.get(message.id) : undefined;
      if (pendingRequest) {
        const { resolve, reject } = pendingRequest;
        this.pending.delete(message.id);

        if (message.error) {
          reject(new Error(message.error));
        } else {
          resolve(message.result);
        }
        return;
      }

      // Handle registration messages from browser
      if ('method' in message) {
        const connection = this.connections.get(ws);
        if (!connection) return;

        if (message.method === 'register') {
          const { id, keys, description, tags } = message.params;
          connection.components.set(id, { keys, description, tags });
          // Send ack
          ws.send(JSON.stringify({ id: message.id, result: { success: true } }));
        } else if (message.method === 'unregister') {
          const { id } = message.params;
          connection.components.delete(id);
          ws.send(JSON.stringify({ id: message.id, result: { success: true } }));
        }
      }
    } catch (error) {
      console.error('[AgentPulse] Failed to parse browser message:', error);
    }
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const { host, port, path, wsPath } = this.options;

    this.httpServer = http.createServer(async (req, res) => {
      // CORS headers
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
        sessionIdGenerator: undefined, // Stateless mode
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

    // Set up WebSocket server for browser connections
    this.wss = new WebSocketServer({ server: this.httpServer, path: wsPath });

    this.wss.on('connection', (ws) => {
      console.log('[AgentPulse] Browser connected');

      const connection: BrowserConnection = {
        ws,
        components: new Map(),
      };
      this.connections.set(ws, connection);

      ws.on('message', (data) => {
        this.handleBrowserMessage(ws, data.toString());
      });

      ws.on('close', () => {
        console.log('[AgentPulse] Browser disconnected');
        this.connections.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[AgentPulse] WebSocket error:', error);
        this.connections.delete(ws);
      });
    });

    const server = this.httpServer;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, host, () => {
        console.log(`[AgentPulse] MCP server started at http://${host}:${port}${path}`);
        console.log(`[AgentPulse] WebSocket endpoint at ws://${host}:${port}${wsPath}`);
        resolve();
      });
    });
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    // Close all WebSocket connections
    for (const connection of this.connections.values()) {
      connection.ws.close();
    }
    this.connections.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      const server = this.httpServer;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      this.httpServer = null;
      console.log('[AgentPulse] MCP server stopped');
    }
  }

  /**
   * Get the server URL
   */
  get url(): string {
    return `http://${this.options.host}:${this.options.port}${this.options.path}`;
  }

  /**
   * Get the WebSocket URL
   */
  get wsUrl(): string {
    return `ws://${this.options.host}:${this.options.port}${this.options.wsPath}`;
  }

  /**
   * Get number of connected browsers
   */
  get connectionCount(): number {
    return this.connections.size;
  }
}

/**
 * Create an AgentPulse MCP server.
 *
 * @example
 * const server = createServer({ port: 3100 });
 * await server.start();
 */
export function createServer(options?: AgentPulseServerOptions): AgentPulseServer {
  return new AgentPulseServer(options);
}
