/**
 * useExpose Hook
 *
 * The primary API for exposing React component state to MCP clients.
 * Dead simple: one line to make your component AI-controllable.
 *
 * @example
 * function ChatInput() {
 *   const [value, setValue] = useState('');
 *
 *   useExpose('chat-input', { value, setValue, send: handleSend });
 *
 *   return <input value={value} onChange={e => setValue(e.target.value)} />;
 * }
 */

import { useContext, useEffect, useId, useRef } from 'react';
import { getRegistry } from './registry.js';
import { AgentPulseContext } from './context.js';
import type { Bindings, ExposeOptions } from './types.js';

/**
 * Expose component state and actions to MCP clients.
 *
 * @param id - Unique identifier (e.g., 'chat-input', 'message-list:node-123')
 * @param bindings - Object of values, setters, and actions to expose
 * @param options - Optional description and tags for discovery
 *
 * @example
 * // Basic usage
 * useExpose('search-box', { query, setQuery, search: handleSearch });
 *
 * @example
 * // With description to help agents understand the component
 * useExpose('chat-input', { value, setValue, send }, {
 *   description: 'Chat input field. Use setValue(text) then send() to send a message.',
 * });
 *
 * @example
 * // Multiple instances with unique IDs
 * useExpose(`todo-item:${item.id}`, { completed, toggle });
 */
export function useExpose(
  id: string,
  bindings: Bindings,
  options: ExposeOptions = {}
): void {
  const { description, tags = [] } = options;
  const transport = useContext(AgentPulseContext);

  // Keep bindings in ref for fresh access without re-registration
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // Create stable proxy that always reads from ref
  const stableBindingsRef = useRef<Bindings | null>(null);
  if (!stableBindingsRef.current) {
    stableBindingsRef.current = new Proxy(
      {},
      {
        get(_target, prop: string) {
          return bindingsRef.current[prop];
        },
        ownKeys() {
          return Object.keys(bindingsRef.current);
        },
        getOwnPropertyDescriptor(_target, prop: string): PropertyDescriptor | undefined {
          return prop in bindingsRef.current
            ? { enumerable: true, configurable: true }
            : undefined;
        },
        has(_target, prop: string) {
          return prop in bindingsRef.current;
        },
      }
    );
  }

  // Stable references for options
  const tagsKey = tags.join('\0');
  const tagsRef = useRef(tags);
  if (tagsRef.current.join('\0') !== tagsKey) {
    tagsRef.current = tags;
  }

  const descriptionRef = useRef(description);
  descriptionRef.current = description;

  useEffect(() => {
    // Register to local registry
    const registry = getRegistry();
    const unregister = registry.register(id, stableBindingsRef.current!, {
      description: descriptionRef.current,
      tags: tagsRef.current,
    });

    // Notify transport (if connected) about registration
    if (transport?.isConnected()) {
      transport.request('register', {
        id,
        keys: Object.keys(bindingsRef.current),
        description: descriptionRef.current,
        tags: tagsRef.current,
      }).catch(() => {
        // Silently ignore transport errors during registration
      });
    }

    return () => {
      unregister();

      // Notify transport about unregistration
      if (transport?.isConnected()) {
        transport.request('unregister', { id }).catch(() => {
          // Silently ignore transport errors during unregistration
        });
      }
    };
  }, [id, tagsKey, transport]);
}

/**
 * Generate a unique expose ID for components with multiple instances.
 *
 * @param prefix - Component type prefix (e.g., 'todo-item')
 * @returns Unique ID like 'todo-item:r1a2b3'
 *
 * @example
 * function TodoItem({ item }) {
 *   const exposeId = useExposeId('todo-item');
 *   useExpose(exposeId, { completed: item.completed, toggle });
 * }
 */
export function useExposeId(prefix: string): string {
  const reactId = useId();
  const cleanId = reactId.replace(/:/g, '').replace(/^r/, '');
  return `${prefix}:${cleanId}`;
}

/**
 * Non-hook version for use outside React components.
 *
 * @example
 * // In a service or module
 * const unregister = expose('api-client', {
 *   isConnected: { get: () => client.connected, set: () => {} },
 *   reconnect: () => client.reconnect(),
 * });
 *
 * // Cleanup when done
 * unregister();
 */
export function expose(
  id: string,
  bindings: Bindings,
  options: ExposeOptions = {}
): () => void {
  const registry = getRegistry();
  return registry.register(id, bindings, options);
}
