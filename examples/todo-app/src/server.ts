/**
 * MCP Server for the Todo App
 *
 * Run this alongside the Vite dev server to enable MCP control.
 */

import { createServer } from 'agentpulse/server';

const server = createServer({
  port: 3100,
  name: 'todo-app',
});

server.start().then(() => {
  console.log('');
  console.log('🚀 AgentPulse MCP server running at http://localhost:3100/mcp');
  console.log('');
  console.log('Connect with any MCP client:');
  console.log('  claude --mcp http://localhost:3100/mcp');
  console.log('');
  console.log('Try these commands:');
  console.log('  > discover()');
  console.log('  > interact({ target: "todo-input", actions: [{ set: { value: "Buy milk" }}, { call: "add" }] })');
  console.log('');
});
