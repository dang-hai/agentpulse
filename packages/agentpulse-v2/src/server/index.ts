/**
 * AgentPulse Server
 *
 * Server-side exports for agentpulse/server
 */

// Agent execution
export { runAgent, runAgentLoop, type AgentLoopOptions } from './agent/loop.js';
export { createSSEResponse, createSSEStream, encodeSSE, SSE_HEADERS } from './agent/stream.js';
export {
  executeToolCall,
  executeToolCalls,
  getAgentPulseTools,
  zodToLLMTool,
} from './agent/tool-adapter.js';

// Providers
export {
  AnthropicProvider,
  createProvider,
  getDefaultModel,
  OpenAIProvider,
  type CompletionOptions,
  type LLMProvider,
  type LLMResponse,
  type LLMTool,
  type ProviderConfig,
  type ProviderName,
} from './providers/index.js';

// Routes
export { handleAgentRequest, type AgentRequest } from './routes/agent.js';
export {
  broadcast,
  getClientCount,
  getClientIds,
  handleWSClose,
  handleWSMessage,
  handleWSOpen,
  handleWSUpgrade,
  type WSClientData,
} from './routes/ws.js';
