/**
 * Target Resolver
 *
 * Resolves binding keys to DOM elements using multiple strategies:
 * 1. Selector config (explicit mapping)
 * 2. Auto-discovery heuristics (fallback)
 */

import type { ElementPosition } from './types.js';

export interface SelectorConfig {
  [componentId: string]: {
    [key: string]: string; // CSS selector
  };
}

export interface TargetResolver {
  resolve(componentId: string, key: string): HTMLElement | null;
  getPosition(componentId: string, key: string): ElementPosition | null;
  getInputElement(componentId: string, key: string): HTMLInputElement | HTMLTextAreaElement | null;
}

/**
 * Creates a target resolver with the given selector config.
 * Falls back to auto-discovery if selector not found or doesn't match.
 */
export function createTargetResolver(config: SelectorConfig = {}): TargetResolver {
  function resolve(componentId: string, key: string): HTMLElement | null {
    // Strategy 1: Use explicit selector from config
    const selector = config[componentId]?.[key];
    if (selector) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[TargetResolver] Found element for ${componentId}.${key} using selector: ${selector}`);
        return element as HTMLElement;
      }
      console.log(`[TargetResolver] Selector not found for ${componentId}.${key}: ${selector}`);
    }

    // Strategy 2: Auto-discovery heuristics
    const discovered = autoDiscover(componentId, key);
    if (discovered) {
      console.log(`[TargetResolver] Auto-discovered element for ${componentId}.${key}`);
    } else {
      console.log(`[TargetResolver] No element found for ${componentId}.${key}`);
    }
    return discovered;
  }

  function getPosition(componentId: string, key: string): ElementPosition | null {
    const element = resolve(componentId, key);
    if (!element) return null;

    // Check if element is in viewport
    const rect = element.getBoundingClientRect();
    const inViewport = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );

    // Scroll into view if outside viewport
    if (!inViewport) {
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      // Re-get rect after scroll
      const newRect = element.getBoundingClientRect();
      return {
        x: newRect.left + window.scrollX,
        y: newRect.top + window.scrollY,
        width: newRect.width,
        height: newRect.height,
      };
    }

    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  function getInputElement(componentId: string, key: string): HTMLInputElement | HTMLTextAreaElement | null {
    const element = resolve(componentId, key);
    if (!element) return null;

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element;
    }

    return element.querySelector('input, textarea');
  }

  return { resolve, getPosition, getInputElement };
}

/**
 * Auto-discovery heuristics for finding DOM elements.
 * Tries multiple strategies based on common patterns.
 */
function autoDiscover(componentId: string, key: string): HTMLElement | null {
  // Normalize key: setName -> name, setFormField -> formfield
  const normalizedKey = key.replace(/^set/, '').toLowerCase();

  // Strategy 1: data-agentpulse-id (backward compat)
  const byDataAttr = document.querySelector(`[data-agentpulse-id="${componentId}-${normalizedKey}"]`);
  if (byDataAttr) return byDataAttr as HTMLElement;

  // Strategy 2: Form with matching data attribute, find input by name
  const formByAttr = document.querySelector(`[data-agentpulse-id="${componentId}"]`);
  if (formByAttr) {
    const inputInForm = formByAttr.querySelector(`[name="${normalizedKey}"], input[placeholder*="${normalizedKey}" i]`);
    if (inputInForm) return inputInForm as HTMLElement;
  }

  // Strategy 3: input/textarea with name attribute
  const byName = document.querySelector(`input[name="${normalizedKey}"], textarea[name="${normalizedKey}"]`);
  if (byName) return byName as HTMLElement;

  // Strategy 4: input/textarea with id
  const byId = document.getElementById(normalizedKey) || document.getElementById(`${componentId}-${normalizedKey}`);
  if (byId) return byId;

  // Strategy 5: input with placeholder containing key
  const byPlaceholder = document.querySelector(`input[placeholder*="${normalizedKey}" i]`);
  if (byPlaceholder) return byPlaceholder as HTMLElement;

  // Strategy 6: aria-label matching
  const byAria = document.querySelector(`[aria-label*="${normalizedKey}" i]`);
  if (byAria) return byAria as HTMLElement;

  // Strategy 7: For actions like submitForm, find submit button
  if (key.toLowerCase().includes('submit')) {
    const submitBtn = document.querySelector(`[data-agentpulse-id="${componentId}"] button[type="submit"]`) ||
                      document.querySelector(`form button[type="submit"]`) ||
                      document.querySelector('button[type="submit"]');
    if (submitBtn) return submitBtn as HTMLElement;
  }

  // Strategy 8: For actions like openForm/closeForm, find related button
  if (key.toLowerCase().includes('open') || key.toLowerCase().includes('close')) {
    const actionBtn = document.querySelector(`button:contains("${key.includes('open') ? 'Add' : 'Cancel'}")`);
    if (actionBtn) return actionBtn as HTMLElement;
  }

  return null;
}

// Singleton resolver instance
let resolverInstance: TargetResolver | null = null;
let currentConfig: SelectorConfig = {};

export function setAnimationConfig(config: SelectorConfig): void {
  currentConfig = config;
  resolverInstance = createTargetResolver(config);
}

export function getTargetResolver(): TargetResolver {
  if (!resolverInstance) {
    resolverInstance = createTargetResolver(currentConfig);
  }
  return resolverInstance;
}

export function clearAnimationConfig(): void {
  currentConfig = {};
  resolverInstance = null;
}
