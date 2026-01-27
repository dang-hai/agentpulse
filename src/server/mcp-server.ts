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
import type { ProcedureName, Procedures, Request } from '../core/index.js';
import { parseMessage, toolDefinitions } from '../core/index.js';
import type { InteractAction } from '../core/tools.js';

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
    // expose_list
    server.registerTool(
      toolDefinitions.expose_list.name,
      {
        description: toolDefinitions.expose_list.description,
        inputSchema: toolDefinitions.expose_list.inputSchema,
      },
      async (args) => {
        const result = await this.proxyRequest('list', args as Procedures['list']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    // expose_get
    server.registerTool(
      toolDefinitions.expose_get.name,
      {
        description: toolDefinitions.expose_get.description,
        inputSchema: toolDefinitions.expose_get.inputSchema,
      },
      async (args) => {
        const result = await this.proxyRequest('get', args as Procedures['get']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    // expose_set
    server.registerTool(
      toolDefinitions.expose_set.name,
      {
        description: toolDefinitions.expose_set.description,
        inputSchema: toolDefinitions.expose_set.inputSchema,
      },
      async (args) => {
        const result = await this.proxyRequest('set', args as Procedures['set']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    // expose_call
    server.registerTool(
      toolDefinitions.expose_call.name,
      {
        description: toolDefinitions.expose_call.description,
        inputSchema: toolDefinitions.expose_call.inputSchema,
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

    // discover
    server.registerTool(
      toolDefinitions.discover.name,
      {
        description: toolDefinitions.discover.description,
        inputSchema: toolDefinitions.discover.inputSchema,
      },
      async (args) => {
        const result = await this.proxyRequest('discover', args as Procedures['discover']['input']);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );

    // interact - executes batch operations via proxy
    server.registerTool(
      toolDefinitions.interact.name,
      {
        description: toolDefinitions.interact.description,
        inputSchema: toolDefinitions.interact.inputSchema,
      },
      async (args) => {
        const { target, actions } = args as { target: string; actions: InteractAction[] };

        const results: Array<{ success: boolean; error?: string; value?: unknown }> = [];

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
    const parsed = parseMessage(data);

    switch (parsed.type) {
      case 'response': {
        const response = parsed.response;
        const pendingRequest = this.pending.get(response.id);
        if (pendingRequest) {
          const { resolve, reject } = pendingRequest;
          this.pending.delete(response.id);

          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
        }
        break;
      }

      case 'request': {
        const request = parsed.request;
        const connection = this.connections.get(ws);
        if (!connection) return;

        if (request.method === 'register') {
          const params = request.params as Procedures['register']['input'];
          connection.components.set(params.id, {
            keys: params.keys,
            description: params.description,
            tags: params.tags,
          });
          ws.send(JSON.stringify({ id: request.id, result: { success: true } }));
        } else if (request.method === 'unregister') {
          const params = request.params as Procedures['unregister']['input'];
          connection.components.delete(params.id);
          ws.send(JSON.stringify({ id: request.id, result: { success: true } }));
        }
        break;
      }

      case 'invalid':
        console.error('[AgentPulse] Invalid browser message:', parsed.reason, parsed.raw);
        break;
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
