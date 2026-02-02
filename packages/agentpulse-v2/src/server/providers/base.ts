/**
 * LLM Provider Base Interface
 *
 * Defines the contract for LLM providers (Anthropic, OpenAI, etc.)
 */

import type { AgentMessage, ToolCall } from '../../core/types.js';

/**
 * Tool definition in LLM-agnostic format
 */
export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Response from LLM completion
 */
export interface LLMResponse {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  content: string;
  toolCalls: ToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Options for LLM completion
 */
export interface CompletionOptions {
  model: string;
  messages: AgentMessage[];
  tools: LLMTool[];
  systemPrompt?: string;
  maxTokens?: number;
}

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Send messages to the LLM and get a response
   */
  complete(options: CompletionOptions): Promise<LLMResponse>;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}
