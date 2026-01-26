/**
 * AgentPulse Server
 *
 * Server-side exports for running the MCP server.
 */

export {
  createInteractContext,
  type InteractContext,
  setDefaultScreenshotCapture,
} from '../tools/interact.js';
export { AgentPulseServer, type AgentPulseServerOptions, createServer } from './mcp-server.js';
