'use client';

import type { UIMessage } from 'ai';

interface MessageListProps {
  messages: UIMessage[];
  isLoading: boolean;
  showToolCalls?: boolean;
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join('');
}

interface ToolPart {
  type: string;
  toolCallId: string;
  toolName?: string;
  state?: string;
}

function isToolPart(part: unknown): part is ToolPart {
  const p = part as { type?: string };
  return p.type?.startsWith('tool-') || p.type === 'dynamic-tool';
}

function getToolName(part: ToolPart): string {
  if (part.type === 'dynamic-tool') {
    return part.toolName || 'unknown';
  }
  return part.type.replace('tool-', '');
}

function getToolCalls(message: UIMessage): ToolPart[] {
  return message.parts.filter(isToolPart) as ToolPart[];
}

export function MessageList({ messages, isLoading, showToolCalls = false }: MessageListProps) {
  return (
    <div className="pill-messages">
      {messages.map((message) => {
        if (message.role === 'user') {
          const text = getTextContent(message);
          return (
            <div key={message.id} className="pill-message user">
              {text}
            </div>
          );
        }

        if (message.role === 'assistant') {
          const text = getTextContent(message);
          const toolCalls = getToolCalls(message);
          const hasTextContent = text.trim().length > 0;
          const hasToolCalls = toolCalls.length > 0;

          if (!hasTextContent && hasToolCalls && !showToolCalls) {
            return null;
          }

          return (
            <div key={message.id} className="pill-message assistant">
              {hasTextContent && <div>{text}</div>}
              {showToolCalls && hasToolCalls && (
                <div className="tool-calls">
                  {toolCalls.map((tool) => (
                    <div key={tool.toolCallId} className="tool-call">
                      <span className="tool-name">{getToolName(tool)}</span>
                      {tool.state === 'output-available' && (
                        <span className="tool-result">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }

        return null;
      })}

      {isLoading && (
        <div className="pill-loading">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      )}
    </div>
  );
}
