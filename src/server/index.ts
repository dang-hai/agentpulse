/**
 * AgentPulse Server
 *
 * Server-side exports for running the MCP server.
 */

export { AgentPulseServer, createServer, type AgentPulseServerOptions } from './mcp-server.js';
export { setScreenshotCapture, injectLog } from '../tools/interact.js';
