/**
 * LLM Providers
 *
 * Factory and exports for LLM provider implementations.
 */

export type { CompletionOptions, LLMProvider, LLMResponse, LLMTool, ProviderConfig } from './base.js';
export { AnthropicProvider } from './anthropic.js';
export { OpenAIProvider } from './openai.js';

import type { LLMProvider, ProviderConfig } from './base.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export type ProviderName = 'anthropic' | 'openai';

/**
 * Create an LLM provider by name
 */
export function createProvider(name: ProviderName, config?: ProviderConfig): LLMProvider {
  switch (name) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: ProviderName): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4o';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
