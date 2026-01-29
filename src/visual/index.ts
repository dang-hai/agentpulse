export {
  type AnimationController,
  createAnimationHooks,
  getAnimationController,
  setAnimationController,
} from './animation-hooks.js';
export { DATA_ATTR, getComponentPosition, getElementByComponentId } from './element-tracker.js';
export { interactionEmitter } from './events.js';
export {
  clearAnimationConfig,
  createTargetResolver,
  getTargetResolver,
  type SelectorConfig,
  setAnimationConfig,
} from './target-resolver.js';
export type {
  AnimationTargetConfig,
  ElementPosition,
  InteractionEndEvent,
  InteractionEvent,
  InteractionStartEvent,
  InteractionType,
  VisualConfig,
} from './types.js';
export { VisualOverlay } from './VisualOverlay.js';
