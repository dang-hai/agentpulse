'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';
import { useExpose } from 'agentpulse';
import { useChatStore } from '@/stores/chatStore';
import { executeToolCall } from '@/lib/agentpulse-tools';
import { MessageList } from './MessageList';
import './styles.css';

interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state?: string;
  input?: unknown;
}

function getToolCallsNeedingResults(messages: UIMessage[]): ToolPart[] {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') return [];

  return lastMessage.parts.filter((part) => {
    const p = part as ToolPart;
    return (p.type?.startsWith('tool-') || p.type === 'dynamic-tool') &&
           p.state === 'input-available';
  }) as ToolPart[];
}

export function FloatingPill() {
  const { isOpen, toggle } = useChatStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const processedToolCalls = useRef<Set<string>>(new Set());

  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);

  const { messages, sendMessage, status, addToolOutput } = useChat({
    transport,
  });

  // Handle tool calls via useEffect - detects tools with state 'input-available'
  // and executes them against the local registry
  useEffect(() => {
    const pendingTools = getToolCallsNeedingResults(messages);

    for (const tool of pendingTools) {
      if (processedToolCalls.current.has(tool.toolCallId)) continue;
      processedToolCalls.current.add(tool.toolCallId);

      const toolName = tool.type === 'dynamic-tool'
        ? (tool.toolName || 'unknown')
        : tool.type.replace('tool-', '');

      executeToolCall({
        toolName,
        args: (tool.input || {}) as Record<string, unknown>,
      }).then((result) => {
        return addToolOutput({
          tool: toolName as 'discover',
          toolCallId: tool.toolCallId,
          output: result,
        });
      }).catch((error) => {
        console.error('[FloatingPill] Tool execution error:', error);
        addToolOutput({
          state: 'output-error',
          tool: toolName as 'discover',
          toolCallId: tool.toolCallId,
          errorText: String(error),
        });
      });
    }
  }, [messages, addToolOutput]);

  const isLoading = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    sendMessage({ text: inputValue });
    setInputValue('');
  }, [inputValue, isLoading, sendMessage]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Expose pill state for debugging via AgentPulse
  useExpose('floating-pill', {
    isOpen,
    status,
    isLoading,
    messageCount: messages.length,
    lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    pendingToolCalls: getToolCallsNeedingResults(messages),
    processedToolCallIds: Array.from(processedToolCalls.current),
    toggle,
    sendTestMessage: (text: string) => sendMessage({ text }),
  }, {
    description: 'Floating AI pill debug. Check status, messages, pendingToolCalls to debug tool execution flow.',
  });

  return (
    <div className="floating-pill-container">
      {isOpen && (
        <div className="pill-panel">
          <div className="pill-header">
            <span className="pill-title">AI Assistant</span>
            <button className="pill-close" onClick={toggle} aria-label="Close">
              ×
            </button>
          </div>

          <MessageList messages={messages} isLoading={isLoading} />
          <div ref={messagesEndRef} />

          <form onSubmit={handleSubmit} className="pill-input-form">
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask me to control the CRM..."
              className="pill-input"
              disabled={isLoading}
            />
            <button
              type="submit"
              className="pill-send"
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send"
            >
              →
            </button>
          </form>
        </div>
      )}

      <button className="pill-toggle" onClick={toggle} aria-label="Toggle AI Assistant">
        <span className="pill-icon">{isOpen ? '×' : 'AI'}</span>
      </button>
    </div>
  );
}
