/**
 * Anthropic Claude Provider
 *
 * Implements LLMProvider for Anthropic's Claude API.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentMessage, ToolCall, ToolResult } from '../../core/types.js';
import type {
  CompletionOptions,
  LLMProvider,
  LLMResponse,
  LLMTool,
  ProviderConfig,
} from './base.js';

type AnthropicMessage = Anthropic.Messages.MessageParam;
type AnthropicContentBlock = Anthropic.Messages.ContentBlockParam;
type AnthropicTool = Anthropic.Messages.Tool;

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor(config: ProviderConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey ?? Bun.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
  }

  async complete(options: CompletionOptions): Promise<LLMResponse> {
    const { model, messages, tools, systemPrompt, maxTokens = 4096 } = options;

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: this.convertMessages(messages),
      tools: this.convertTools(tools),
    });

    return this.parseResponse(response);
  }

  private convertMessages(messages: AgentMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        const content: AnthropicContentBlock[] = [];

        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }

        if (msg.toolCalls) {
          for (const call of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: call.id,
              name: call.name,
              input: call.input as Record<string, unknown>,
            });
          }
        }

        result.push({ role: 'assistant', content });
      } else if (msg.role === 'tool' && msg.toolResults) {
        const toolResultContent: AnthropicContentBlock[] = msg.toolResults.map(
          (r: ToolResult) => ({
            type: 'tool_result' as const,
            tool_use_id: r.id,
            content: r.content,
            is_error: r.isError ?? false,
          })
        );

        result.push({ role: 'user', content: toolResultContent });
      }
    }

    return result;
  }

  private convertTools(tools: LLMTool[]): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
    }));
  }

  private parseResponse(response: Anthropic.Messages.Message): LLMResponse {
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    let stopReason: LLMResponse['stopReason'];
    switch (response.stop_reason) {
      case 'tool_use':
        stopReason = 'tool_use';
        break;
      case 'max_tokens':
        stopReason = 'max_tokens';
        break;
      case 'stop_sequence':
        stopReason = 'stop_sequence';
        break;
      default:
        stopReason = 'end_turn';
    }

    return {
      stopReason,
      content: textContent,
      toolCalls,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
