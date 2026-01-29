/**
 * Tracks DOM elements by their AgentPulse component IDs.
 * Uses data-agentpulse-id attributes to locate elements.
 */

import type { ElementPosition } from './types.js';

const DATA_ATTR = 'data-agentpulse-id';

export function getElementByComponentId(componentId: string, key?: string): HTMLElement | null {
  // First, try to find a specific element for componentId-key combination
  if (key) {
    // Try: componentId-fieldName (e.g., contact-form-name for setName)
    const fieldName = key.replace(/^set/, '').toLowerCase();
    const specificElement = document.querySelector(`[${DATA_ATTR}="${componentId}-${fieldName}"]`);
    if (specificElement) return specificElement as HTMLElement;
  }

  // Fall back to the component container
  return document.querySelector(`[${DATA_ATTR}="${componentId}"]`);
}

export function getElementPosition(element: HTMLElement): ElementPosition {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

export function getComponentPosition(componentId: string, key?: string): ElementPosition | null {
  const element = getElementByComponentId(componentId, key);
  if (!element) return null;
  return getElementPosition(element);
}

export function getInputElement(
  componentId: string,
  key?: string
): HTMLInputElement | HTMLTextAreaElement | null {
  const container = getElementByComponentId(componentId, key);
  if (!container) return null;

  if (container instanceof HTMLInputElement || container instanceof HTMLTextAreaElement) {
    return container;
  }

  return container.querySelector('input, textarea');
}

export { DATA_ATTR };
