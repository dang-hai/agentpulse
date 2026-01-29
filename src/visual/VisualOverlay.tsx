/**
 * VisualOverlay - Renders visual feedback for AI interactions.
 *
 * Uses OpenScreen-style smooth interpolation for cursor movement:
 * nextValue = prevValue + (targetValue - prevValue) * SMOOTHING_FACTOR
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getRegistry } from '../core/registry.js';
import { createAnimationHooks, setAnimationController } from './animation-hooks.js';
import { interactionEmitter } from './events.js';
import { getTargetResolver, type SelectorConfig, setAnimationConfig } from './target-resolver.js';
import type { InteractionEvent, InteractionStartEvent, VisualConfig } from './types.js';

// Smoothing constants (OpenScreen style)
const SMOOTHING_FACTOR = 0.08; // Lower = smoother/slower (OpenScreen uses 0.1)
const MIN_DELTA = 0.5; // Stop animating when within this distance

interface CursorState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  visible: boolean;
  clicking: boolean;
}

interface TypingState {
  componentId: string;
  key: string;
  targetValue: string;
  currentIndex: number;
  inputElement: HTMLInputElement | HTMLTextAreaElement | null;
}

interface RippleState {
  id: string;
  x: number;
  y: number;
}

interface PendingAction {
  type: 'click' | 'type';
  componentId?: string;
  key?: string;
  value?: string;
}

interface VisualOverlayProps extends VisualConfig {
  targets?: SelectorConfig;
}

const DEFAULT_CONFIG: Required<VisualConfig> = {
  enabled: true,
  cursor: true,
  clickRipple: true,
  typingAnimation: true,
  cursorDuration: 300, // Not used with interpolation, kept for API compat
  typingSpeed: 12, // Base characters per second (human average ~8-12)
};

// Human typing cadence helpers
function getHumanTypingDelay(baseDelay: number, char: string, prevChar: string): number {
  let delay = baseDelay;

  // Add randomness (±30% variation)
  const variation = 0.3;
  delay *= 1 + (Math.random() * 2 - 1) * variation;

  // Pause longer after spaces (word boundaries)
  if (prevChar === ' ') {
    delay *= 1.4 + Math.random() * 0.3;
  }

  // Pause after punctuation
  if (/[.,!?;:]/.test(prevChar)) {
    delay *= 1.8 + Math.random() * 0.4;
  }

  // Faster for common letter pairs (muscle memory)
  const commonPairs = [
    'th',
    'he',
    'in',
    'er',
    'an',
    'on',
    'or',
    'en',
    'at',
    'es',
    'ed',
    'ng',
    'ou',
    'io',
  ];
  const pair = (prevChar + char).toLowerCase();
  if (commonPairs.includes(pair)) {
    delay *= 0.7;
  }

  // Occasional micro-hesitation (thinking pause)
  if (Math.random() < 0.05) {
    delay *= 2.5;
  }

  // Capital letters slightly slower (shift key)
  if (char !== char.toLowerCase() && char === char.toUpperCase() && /[A-Z]/.test(char)) {
    delay *= 1.2;
  }

  return Math.max(delay, 30); // Minimum 30ms between keystrokes
}

export function VisualOverlay(props: VisualOverlayProps = {}) {
  const { targets, ...visualConfig } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: props spread creates stable primitive values
  const config = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...visualConfig }),
    [
      visualConfig.enabled,
      visualConfig.cursor,
      visualConfig.clickRipple,
      visualConfig.typingAnimation,
      visualConfig.typingSpeed,
    ]
  );

  // Initialize target resolver with config
  useEffect(() => {
    if (targets) {
      setAnimationConfig(targets);
    }
  }, [targets]);

  // Register animation controller and hooks with the registry
  useEffect(() => {
    if (!config.enabled) return;

    const controller = {
      isEnabled: () => config.enabled && config.cursor,

      moveCursorTo: (x: number, y: number): Promise<void> => {
        return new Promise((resolve) => {
          cursorRef.current.visible = true;
          cursorRef.current.targetX = x;
          cursorRef.current.targetY = y;
          cursorArriveResolverRef.current = resolve;
          setCursorDisplay({ ...cursorRef.current });

          // Start animation loop
          if (!isAnimatingRef.current) {
            isAnimatingRef.current = true;
            const tick = () => {
              const cursor = cursorRef.current;
              const deltaX = cursor.targetX - cursor.x;
              const deltaY = cursor.targetY - cursor.y;
              const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

              if (distance > MIN_DELTA) {
                cursor.x += deltaX * SMOOTHING_FACTOR;
                cursor.y += deltaY * SMOOTHING_FACTOR;
                setCursorDisplay({ ...cursor });
                animationFrameRef.current = requestAnimationFrame(tick);
              } else {
                cursor.x = cursor.targetX;
                cursor.y = cursor.targetY;
                setCursorDisplay({ ...cursor });
                isAnimatingRef.current = false;
                if (cursorArriveResolverRef.current) {
                  cursorArriveResolverRef.current();
                  cursorArriveResolverRef.current = null;
                }
              }
            };
            animationFrameRef.current = requestAnimationFrame(tick);
          }
        });
      },

      showClick: (x: number, y: number): Promise<void> => {
        return new Promise((resolve) => {
          cursorRef.current.clicking = true;
          setCursorDisplay({ ...cursorRef.current });
          if (config.clickRipple) {
            const id = `ripple_${Date.now()}`;
            setRipples((prev) => [...prev, { id, x, y }]);
            setTimeout(() => {
              setRipples((prev) => prev.filter((r) => r.id !== id));
            }, 600);
          }
          setTimeout(() => {
            cursorRef.current.clicking = false;
            setCursorDisplay({ ...cursorRef.current });
            resolve();
          }, 200);
        });
      },

      typeText: (element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> => {
        return new Promise((resolve) => {
          if (!config.typingAnimation) {
            // Set value directly without animation
            const nativeInputValueSetter =
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
              Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(element, text);
              element.dispatchEvent(new Event('input', { bubbles: true }));
            }
            resolve();
            return;
          }

          // Clear input first
          const nativeInputValueSetter =
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, '');
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // Type character by character
          let currentIndex = 0;
          const baseDelay = 1000 / config.typingSpeed;

          const typeNext = () => {
            if (currentIndex >= text.length) {
              resolve();
              return;
            }

            const prevChar = currentIndex > 0 ? text[currentIndex - 1] : '';
            const char = text[currentIndex];
            const delay = getHumanTypingDelay(baseDelay, char, prevChar);

            setTimeout(() => {
              currentIndex++;
              const newValue = text.slice(0, currentIndex);
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(element, newValue);
                element.dispatchEvent(new Event('input', { bubbles: true }));
              }
              typeNext();
            }, delay);
          };

          typeNext();
        });
      },
    };

    setAnimationController(controller);

    // Register hooks with the registry
    const registry = getRegistry();
    const hooks = createAnimationHooks();
    registry.setAnimationHooks(hooks);

    return () => {
      setAnimationController(null);
      registry.setAnimationHooks(null);
    };
  }, [
    config.enabled,
    config.cursor,
    config.clickRipple,
    config.typingAnimation,
    config.typingSpeed,
  ]);

  const cursorRef = useRef<CursorState>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
    targetX: 0,
    targetY: 0,
    visible: false,
    clicking: false,
  });
  const [cursorDisplay, setCursorDisplay] = useState(cursorRef.current);
  const [ripples, setRipples] = useState<RippleState[]>([]);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSetRef = useRef<Map<string, InteractionStartEvent>>(new Map());
  const pendingActionRef = useRef<PendingAction | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionRef = useRef<number>(0);

  // Promise resolver for hook-based cursor animations
  const cursorArriveResolverRef = useRef<(() => void) | null>(null);

  // Continuous interpolation animation loop
  const startAnimationLoop = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    function tick() {
      const cursor = cursorRef.current;
      const deltaX = cursor.targetX - cursor.x;
      const deltaY = cursor.targetY - cursor.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > MIN_DELTA) {
        // Interpolate towards target
        cursor.x += deltaX * SMOOTHING_FACTOR;
        cursor.y += deltaY * SMOOTHING_FACTOR;
        setCursorDisplay({ ...cursor });
        animationFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Snap to target and execute pending action
        cursor.x = cursor.targetX;
        cursor.y = cursor.targetY;
        setCursorDisplay({ ...cursor });
        isAnimatingRef.current = false;

        // Resolve the promise if we're waiting for cursor arrival
        if (cursorArriveResolverRef.current) {
          cursorArriveResolverRef.current();
          cursorArriveResolverRef.current = null;
        }

        // Execute pending action after cursor arrives
        const action = pendingActionRef.current;
        if (action) {
          pendingActionRef.current = null;
          if (action.type === 'click') {
            cursorRef.current.clicking = true;
            setCursorDisplay({ ...cursorRef.current });
            if (config.clickRipple) {
              addRipple(cursor.x, cursor.y);
            }
            setTimeout(() => {
              cursorRef.current.clicking = false;
              setCursorDisplay({ ...cursorRef.current });
            }, 150);
          } else if (
            action.type === 'type' &&
            action.componentId &&
            action.key &&
            action.value !== undefined
          ) {
            startTyping(action.componentId, action.key, action.value);
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick);
    // biome-ignore lint/correctness/noInvalidUseBeforeDeclaration: functions available at callback execution time
  }, [config.clickRipple, addRipple, startTyping]);

  // Move cursor to target position
  const moveCursorTo = useCallback(
    (targetX: number, targetY: number, onArrive?: PendingAction) => {
      cursorRef.current.visible = true;
      cursorRef.current.targetX = targetX;
      cursorRef.current.targetY = targetY;
      pendingActionRef.current = onArrive || null;
      setCursorDisplay({ ...cursorRef.current });
      startAnimationLoop();
    },
    [startAnimationLoop]
  );

  const addRipple = useCallback((x: number, y: number) => {
    const id = `ripple_${Date.now()}`;
    setRipples((prev) => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  }, []);

  // Schedule hiding cursor after inactivity
  const scheduleHideCursor = useCallback(
    (delay: number = 2000) => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      hideTimeoutRef.current = setTimeout(() => {
        // Only hide if no recent interactions and not currently typing
        const timeSinceLastInteraction = Date.now() - lastInteractionRef.current;
        if (timeSinceLastInteraction >= delay - 100 && !typing) {
          cursorRef.current.visible = false;
          setCursorDisplay({ ...cursorRef.current });
        }
      }, delay);
    },
    [typing]
  );

  // Keep cursor visible on any interaction
  const keepCursorVisible = useCallback(() => {
    lastInteractionRef.current = Date.now();
    cursorRef.current.visible = true;
    setCursorDisplay({ ...cursorRef.current });
    scheduleHideCursor(3000); // Hide after 3s of inactivity
  }, [scheduleHideCursor]);

  const startTyping = useCallback((componentId: string, key: string, targetValue: string) => {
    const resolver = getTargetResolver();
    const inputElement = resolver.getInputElement(componentId, key);
    if (!inputElement) return;

    // Clear the input and type from scratch
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(inputElement, '');
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setTyping({ componentId, key, targetValue, currentIndex: 0, inputElement });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Animate typing character by character with human cadence
  useEffect(() => {
    if (!typing || !config.typingAnimation) return;

    const { targetValue, currentIndex, inputElement } = typing;
    if (!inputElement || currentIndex >= targetValue.length) {
      setTyping(null);
      return;
    }

    // Get current and next character for timing calculation
    const prevChar = currentIndex > 0 ? targetValue[currentIndex - 1] : '';
    const nextChar = targetValue[currentIndex];

    // Use human-like delay
    const baseDelay = 1000 / config.typingSpeed;
    const delay = getHumanTypingDelay(baseDelay, nextChar, prevChar);

    typingTimeoutRef.current = setTimeout(() => {
      const nextIndex = currentIndex + 1;
      const nextValue = targetValue.slice(0, nextIndex);

      const nativeInputValueSetter =
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputElement, nextValue);
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      }

      setTyping((prev) => (prev ? { ...prev, currentIndex: nextIndex } : null));
    }, delay);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [typing, config.typingAnimation, config.typingSpeed]);

  // Subscribe to interaction events
  useEffect(() => {
    if (!config.enabled) return;

    const unsubscribe = interactionEmitter.subscribe((event: InteractionEvent) => {
      if (event.type === 'interaction-start') {
        keepCursorVisible();
        const resolver = getTargetResolver();
        const pos = resolver.getPosition(event.componentId, event.key);

        // Always show cursor and move it to target
        if (pos && config.cursor) {
          const targetX = pos.x + pos.width / 2;
          const targetY = pos.y + pos.height / 2;

          if (event.interactionType === 'set' && typeof event.value === 'string') {
            pendingSetRef.current.set(event.id, event);
            // Move cursor, start typing immediately (don't wait for cursor)
            moveCursorTo(targetX, targetY, undefined);
            if (config.typingAnimation) {
              // Small delay to let cursor start moving, but don't wait for it to arrive
              setTimeout(() => {
                startTyping(event.componentId, event.key, event.value as string);
              }, 150);
            }
          } else if (event.interactionType === 'call') {
            // For calls, show click effect immediately at target position
            moveCursorTo(targetX, targetY, undefined);
            // Show click ripple after brief delay
            setTimeout(() => {
              if (config.clickRipple) {
                addRipple(targetX, targetY);
              }
              cursorRef.current.clicking = true;
              setCursorDisplay({ ...cursorRef.current });
              setTimeout(() => {
                cursorRef.current.clicking = false;
                setCursorDisplay({ ...cursorRef.current });
              }, 150);
            }, 250);
          }
        } else if (event.interactionType === 'set' && typeof event.value === 'string') {
          pendingSetRef.current.set(event.id, event);
          if (config.typingAnimation) {
            startTyping(event.componentId, event.key, event.value as string);
          }
        }
      } else if (event.type === 'interaction-end') {
        pendingSetRef.current.delete(event.id);
        keepCursorVisible(); // Reset hide timer
      }
    });

    return unsubscribe;
  }, [config, moveCursorTo, startTyping, addRipple, keepCursorVisible]);

  if (!config.enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    >
      {/* Cursor */}
      {config.cursor && cursorDisplay.visible && (
        <div
          style={{
            position: 'absolute',
            left: cursorDisplay.x,
            top: cursorDisplay.y,
            transform: `translate(-4px, -2px) ${cursorDisplay.clicking ? 'scale(0.85)' : 'scale(1)'}`,
            transition: 'transform 0.1s ease-out',
            willChange: 'left, top, transform',
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}
            aria-label="AI cursor"
            role="img"
          >
            <path
              d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z"
              fill="#4F46E5"
              stroke="#fff"
              strokeWidth="1.5"
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              left: 22,
              top: 10,
              background: '#4F46E5',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
            }}
          >
            AI
          </div>
        </div>
      )}

      {/* Click ripples */}
      {config.clickRipple &&
        ripples.map((ripple) => (
          <div
            key={ripple.id}
            style={{
              position: 'absolute',
              left: ripple.x,
              top: ripple.y,
              width: 50,
              height: 50,
              marginLeft: -25,
              marginTop: -25,
              borderRadius: '50%',
              border: '3px solid #4F46E5',
              animation: 'agentpulse-ripple 0.6s ease-out forwards',
            }}
          />
        ))}

      {/* Typing indicator */}
      {typing && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 16px rgba(79, 70, 229, 0.4)',
          }}
        >
          <span style={{ animation: 'agentpulse-pulse 1s infinite' }}>●</span>
          AI is typing...
        </div>
      )}

      <style>{`
        @keyframes agentpulse-ripple {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
        @keyframes agentpulse-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
