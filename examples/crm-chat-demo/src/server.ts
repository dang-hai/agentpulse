/**
 * MCP Server for the CRM App
 *
 * Run this alongside the Next.js dev server to enable MCP control.
 */

import { createServer } from 'agentpulse/server';

const server = createServer({
  port: 3100,
  name: 'crm-app',
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
  console.log('  > interact({ target: "contacts", actions: [{ call: { name: "addContact", args: { name: "John Doe", email: "john@example.com" } }}] })');
  console.log('  > interact({ target: "deals", actions: [{ call: { name: "moveDeal", args: { id: "...", stage: "qualified" } }}] })');
  console.log('');
});
