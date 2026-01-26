#!/usr/bin/env node
/**
 * AgentPulse CLI
 *
 * Start the MCP server from the command line.
 *
 * Usage:
 *   npx agentpulse [--host localhost] [--port 3100]
 */

import { createServer } from './server/index.js';

function parseArgs(args: string[]): { host: string; port: number } {
  let host = 'localhost';
  let port = 3100;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host' || arg === '-H') {
      const value = args[++i];
      if (value) {
        host = value;
      }
    } else if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      if (value) {
        port = parseInt(value, 10);
        if (Number.isNaN(port)) {
          console.error(`Invalid port: ${value}`);
          process.exit(1);
        }
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
AgentPulse - Make React apps MCP-controllable

Usage:
  npx agentpulse [options]

Options:
  -H, --host <string>  Host to bind to (default: localhost)
  -p, --port <number>  Port to listen on (default: 3100)
  -h, --help           Show this help message

Examples:
  npx agentpulse
  npx agentpulse --port 8080
  npx agentpulse --host 0.0.0.0 --port 3100
`);
      process.exit(0);
    }
  }

  return { host, port };
}

async function main() {
  const { host, port } = parseArgs(process.argv.slice(2));

  const server = createServer({ host, port });

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[AgentPulse] Shutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.start();
}

main().catch((error) => {
  console.error('[AgentPulse] Failed to start:', error.message);
  process.exit(1);
});
