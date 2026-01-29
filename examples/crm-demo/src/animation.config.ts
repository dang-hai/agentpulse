/**
 * Animation Target Config (EPHEMERAL)
 *
 * This file maps AgentPulse binding keys to DOM elements via CSS selectors.
 * It's used by the visual overlay to animate cursor movement and typing.
 *
 * TO REMOVE ANIMATION SUPPORT: Delete this file and the VisualOverlay import.
 */

import type { SelectorConfig } from 'agentpulse';

export const animationTargets: SelectorConfig = {
  // Data attributes on elements are auto-discovered
  // This config is for fallback selectors only

  'contact-form': {
    openForm: '.layout > div:first-child button.primary.small',
  },

  'deal-form': {
    openForm: '.layout > div:last-child button.primary.small',
  },
};
