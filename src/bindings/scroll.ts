/**
 * Scroll Bindings
 *
 * Creates bindings for scroll control on DOM elements.
 * Composable with useExpose for AI-controllable scrolling.
 *
 * @example
 * const containerRef = useRef<HTMLDivElement>(null);
 *
 * useExpose('message-list', {
 *   ...createScrollBindings(containerRef),
 *   messages,
 * });
 */

import type { RefObject } from 'react';
import type { Bindings } from '../core/types.js';

export interface ScrollBindingsOptions {
  /** Scroll behavior: 'smooth' for animated, 'auto' for instant. Default: 'smooth' */
  behavior?: ScrollBehavior;
}

/**
 * Creates scroll control bindings from a ref to a scrollable element.
 *
 * Exposes:
 * - `scrollTop`: Current scroll position (read-only)
 * - `scrollHeight`: Total scrollable height (read-only)
 * - `clientHeight`: Visible height (read-only)
 * - `scrollToTop()`: Scroll to the top
 * - `scrollToBottom()`: Scroll to the bottom
 * - `scrollTo(position)`: Scroll to a specific position
 * - `scrollBy(delta)`: Scroll by a relative amount
 *
 * @param ref - React ref to a scrollable DOM element
 * @param options - Scroll behavior options
 */
export function createScrollBindings(
  ref: RefObject<HTMLElement | null>,
  options: ScrollBindingsOptions = {}
): Bindings {
  const { behavior = 'smooth' } = options;

  return {
    scrollTop: {
      get: () => ref.current?.scrollTop ?? 0,
      set: (value: unknown) => {
        if (typeof value === 'number' && ref.current) {
          ref.current.scrollTo({ top: value, behavior });
        }
      },
    },

    scrollHeight: {
      get: () => ref.current?.scrollHeight ?? 0,
      set: () => {},
    },

    clientHeight: {
      get: () => ref.current?.clientHeight ?? 0,
      set: () => {},
    },

    scrollToTop: () => {
      ref.current?.scrollTo({ top: 0, behavior });
    },

    scrollToBottom: () => {
      if (ref.current) {
        ref.current.scrollTo({ top: ref.current.scrollHeight, behavior });
      }
    },

    scrollTo: (position: number) => {
      if (typeof position === 'number' && ref.current) {
        ref.current.scrollTo({ top: position, behavior });
      }
    },

    scrollBy: (delta: number) => {
      if (typeof delta === 'number' && ref.current) {
        ref.current.scrollBy({ top: delta, behavior });
      }
    },
  };
}
