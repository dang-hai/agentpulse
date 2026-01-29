/**
 * Animation Hooks Implementation
 *
 * Provides pre/post hooks for registry operations that handle:
 * - Cursor movement to target elements
 * - Click animations for calls
 * - Typing animations for sets
 */

import type { AnimationHooks } from '../core/registry.js';
import { getTargetResolver } from './target-resolver.js';

export interface AnimationController {
  /** Move cursor to position, returns when cursor arrives */
  moveCursorTo(x: number, y: number): Promise<void>;
  /** Show click animation at current cursor position */
  showClick(x: number, y: number): Promise<void>;
  /** Type text into an input element with animation */
  typeText(element: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void>;
  /** Check if animations are enabled */
  isEnabled(): boolean;
}

let controller: AnimationController | null = null;

export function setAnimationController(ctrl: AnimationController | null): void {
  controller = ctrl;
}

export function getAnimationController(): AnimationController | null {
  return controller;
}

/**
 * Creates animation hooks that use the target resolver and animation controller.
 */
export function createAnimationHooks(): AnimationHooks {
  return {
    async preCall(componentId: string, key: string, _args: unknown[]): Promise<void> {
      if (!controller?.isEnabled()) return;

      const resolver = getTargetResolver();
      const pos = resolver.getPosition(componentId, key);

      if (pos) {
        const targetX = pos.x + pos.width / 2;
        const targetY = pos.y + pos.height / 2;

        // Move cursor to element
        await controller.moveCursorTo(targetX, targetY);

        // Show click animation
        await controller.showClick(targetX, targetY);
      }
    },

    async postCall(_componentId: string, _key: string, _success: boolean): Promise<void> {
      // Could show success/error feedback here
    },

    async preSet(componentId: string, key: string, value: unknown): Promise<void> {
      if (!controller?.isEnabled()) return;
      if (typeof value !== 'string') return;

      const resolver = getTargetResolver();
      const pos = resolver.getPosition(componentId, key);
      const inputElement = resolver.getInputElement(componentId, key);

      if (pos) {
        const targetX = pos.x + pos.width / 2;
        const targetY = pos.y + pos.height / 2;

        // Move cursor to element
        await controller.moveCursorTo(targetX, targetY);

        // Type the text if we have an input element
        if (inputElement) {
          await controller.typeText(inputElement, value);
        }
      }
    },

    async postSet(_componentId: string, _key: string, _success: boolean): Promise<void> {
      // Could show success/error feedback here
    },
  };
}
