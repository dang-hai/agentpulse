/**
 * Types for visual interaction feedback.
 */

export type InteractionType = 'set' | 'call';

export interface InteractionStartEvent {
  type: 'interaction-start';
  id: string;
  componentId: string;
  key: string;
  interactionType: InteractionType;
  value?: unknown;
  args?: unknown[];
  timestamp: number;
}

export interface InteractionEndEvent {
  type: 'interaction-end';
  id: string;
  componentId: string;
  key: string;
  interactionType: InteractionType;
  success: boolean;
  error?: string;
  duration: number;
  timestamp: number;
}

export type InteractionEvent = InteractionStartEvent | InteractionEndEvent;
export type InteractionListener = (event: InteractionEvent) => void;

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualConfig {
  enabled?: boolean;
  cursor?: boolean;
  clickRipple?: boolean;
  typingAnimation?: boolean;
  cursorDuration?: number;
  typingSpeed?: number;
}

/**
 * Selector-based animation target config.
 * Maps component IDs to binding key -> CSS selector mappings.
 * This is the ephemeral config that can be injected/removed for demos.
 */
export interface AnimationTargetConfig {
  [componentId: string]: {
    [bindingKey: string]: string; // CSS selector
  };
}
