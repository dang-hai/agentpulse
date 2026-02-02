/**
 * useAgent Hook
 *
 * Hook for invoking agents to control your app.
 *
 * @example
 * function MyApp() {
 *   const { run, stream, isRunning, messages, result, error, reset } = useAgent();
 *
 *   const handleClick = async () => {
 *     await run('Click the submit button');
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleClick} disabled={isRunning}>
 *         {isRunning ? 'Running...' : 'Run Agent'}
 *       </button>
 *       {error && <p>Error: {error}</p>}
 *       {result && <p>Result: {result.finalResponse}</p>}
 *     </div>
 *   );
 * }
 */

import { useCallback, useContext, useRef, useState } from 'react';
import { AgentPulseContext } from './context.js';
import type { AgentConfig, AgentMessage, AgentRunResult, AgentStreamEvent } from '../core/types.js';

/**
 * Return type for useAgent hook
 */
export interface UseAgentReturn {
  /** Run an agent with a prompt (blocking - waits for completion) */
  run: (prompt: string, config?: AgentConfig) => Promise<AgentRunResult>;
  /** Stream an agent execution with a prompt (non-blocking - yields events) */
  stream: (prompt: string, config?: AgentConfig) => AsyncGenerator<AgentStreamEvent, void, unknown>;
  /** Stop the current agent execution */
  stop: () => void;
  /** Whether an agent is currently running */
  isRunning: boolean;
  /** Messages from the current/last agent run */
  messages: AgentMessage[];
  /** Result from the last completed agent run */
  result: AgentRunResult | null;
  /** Error from the last agent run (if any) */
  error: string | null;
  /** Reset all state */
  reset: () => void;
}

/**
 * Hook for invoking agents to control your app.
 *
 * @returns Object with run, stream, stop, isRunning, messages, result, error, and reset
 *
 * @example
 * const { run, isRunning, result } = useAgent();
 *
 * // Blocking execution
 * const result = await run('Fill in the form and submit');
 *
 * @example
 * const { stream, isRunning, messages } = useAgent();
 *
 * // Streaming execution
 * for await (const event of stream('Type hello in the chat')) {
 *   console.log(event.type, event);
 * }
 */
export function useAgent(): UseAgentReturn {
  const { httpTransport, isConnected } = useContext(AgentPulseContext);

  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);

  const reset = useCallback(() => {
    setIsRunning(false);
    setMessages([]);
    setResult(null);
    setError(null);
    abortRef.current = false;
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
    httpTransport?.stopAgent();
    setIsRunning(false);
  }, [httpTransport]);

  const run = useCallback(
    async (prompt: string, config?: AgentConfig): Promise<AgentRunResult> => {
      if (!httpTransport) {
        throw new Error(
          'useAgent requires apiKey. Use <AgentPulse apiKey="..."> for hosted mode.'
        );
      }

      if (!isConnected) {
        throw new Error('Not connected to AgentPulse server');
      }

      setIsRunning(true);
      setError(null);
      setMessages([]);
      setResult(null);
      abortRef.current = false;

      try {
        const runResult = await httpTransport.runAgent(prompt, config);
        setResult(runResult);
        setMessages(runResult.messages);
        return runResult;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    [httpTransport, isConnected]
  );

  const stream = useCallback(
    async function* (
      prompt: string,
      config?: AgentConfig
    ): AsyncGenerator<AgentStreamEvent, void, unknown> {
      if (!httpTransport) {
        throw new Error(
          'useAgent requires apiKey. Use <AgentPulse apiKey="..."> for hosted mode.'
        );
      }

      if (!isConnected) {
        throw new Error('Not connected to AgentPulse server');
      }

      setIsRunning(true);
      setError(null);
      setMessages([]);
      setResult(null);
      abortRef.current = false;

      try {
        const eventMessages: AgentMessage[] = [];

        for await (const event of httpTransport.streamAgent(prompt, config)) {
          if (abortRef.current) {
            break;
          }

          yield event;

          switch (event.type) {
            case 'text': {
              const lastMsg = eventMessages[eventMessages.length - 1];
              if (lastMsg?.role === 'assistant') {
                lastMsg.content += event.content;
              } else {
                eventMessages.push({ role: 'assistant', content: event.content });
              }
              setMessages([...eventMessages]);
              break;
            }
            case 'tool_call': {
              const lastMsg = eventMessages[eventMessages.length - 1];
              if (lastMsg?.role === 'assistant') {
                lastMsg.toolCalls = lastMsg.toolCalls || [];
                lastMsg.toolCalls.push(event.call);
              }
              setMessages([...eventMessages]);
              break;
            }
            case 'tool_result': {
              eventMessages.push({
                role: 'tool',
                content: event.result.content,
                toolResults: [event.result],
              });
              setMessages([...eventMessages]);
              break;
            }
            case 'done': {
              setResult(event.result);
              setMessages(event.result.messages);
              break;
            }
            case 'error': {
              setError(event.error);
              break;
            }
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw err;
      } finally {
        setIsRunning(false);
      }
    },
    [httpTransport, isConnected]
  );

  return {
    run,
    stream,
    stop,
    isRunning,
    messages,
    result,
    error,
    reset,
  };
}
