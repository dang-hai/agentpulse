/**
 * Interaction event emitter for visual feedback.
 */

import type { InteractionEvent, InteractionListener } from './types.js';

class InteractionEmitter {
  private listeners = new Set<InteractionListener>();

  subscribe(listener: InteractionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: InteractionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.warn('[AgentPulse] Interaction listener error:', e);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const interactionEmitter = new InteractionEmitter();
