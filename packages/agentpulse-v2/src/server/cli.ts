#!/usr/bin/env bun
/**
 * AgentPulse Server CLI
 *
 * Entry point for `bunx agentpulse-v2`
 */

import { handleAgentRequest } from './routes/agent.js';
import {
  getClientCount,
  handleWSClose,
  handleWSMessage,
  handleWSOpen,
  type WSClientData,
} from './routes/ws.js';

const DEFAULT_PORT = 3100;
const port = Number(Bun.env.PORT) || DEFAULT_PORT;

console.log(`Starting AgentPulse server on port ${port}...`);

const server = Bun.serve<WSClientData>({
  port,

  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (path === '/ws') {
      const success = server.upgrade(req, {
        data: {
          id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          connectedAt: Date.now(),
        },
      });

      if (success) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 500 });
    }

    if (path === '/health' || path === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          version: '0.1.0',
          clients: getClientCount(),
          timestamp: Date.now(),
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    if (path === '/api/agent') {
      return handleAgentRequest(req);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },

  websocket: {
    open(ws) {
      handleWSOpen(ws);
      console.log(`Client connected: ${ws.data.id}`);
    },

    message(ws, message) {
      handleWSMessage(ws, message);
    },

    close(ws) {
      handleWSClose(ws);
      console.log(`Client disconnected: ${ws.data.id}`);
    },
  },
});

console.log(`AgentPulse server running at http://localhost:${server.port}`);
console.log(`  - Health check: http://localhost:${server.port}/health`);
console.log(`  - Agent API:    http://localhost:${server.port}/api/agent`);
console.log(`  - WebSocket:    ws://localhost:${server.port}/ws`);
