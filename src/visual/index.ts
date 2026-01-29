export { VisualOverlay } from './VisualOverlay.js';
export { interactionEmitter } from './events.js';
export { getElementByComponentId, getComponentPosition, DATA_ATTR } from './element-tracker.js';
export {
  createTargetResolver,
  setAnimationConfig,
  getTargetResolver,
  clearAnimationConfig,
  type SelectorConfig,
} from './target-resolver.js';
export {
  createAnimationHooks,
  setAnimationController,
  getAnimationController,
  type AnimationController,
} from './animation-hooks.js';
export type {
  InteractionEvent,
  InteractionStartEvent,
  InteractionEndEvent,
  VisualConfig,
  InteractionType,
  ElementPosition,
  AnimationTargetConfig,
} from './types.js';
