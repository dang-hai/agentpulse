/**
 * AgentPulse MCP Tools
 *
 * All tools for MCP clients to interact with exposed React components.
 */

export {
  exposeList,
  exposeListSchema,
  exposeGet,
  exposeGetSchema,
  exposeSet,
  exposeSetSchema,
  exposeCall,
  exposeCallSchema,
  type ExposeListInput,
  type ExposeGetInput,
  type ExposeSetInput,
  type ExposeCallInput,
} from './expose.js';

export {
  discover,
  discoverSchema,
  type DiscoverInput,
} from './discover.js';

export {
  interact,
  interactSchema,
  setScreenshotCapture,
  injectLog,
  type InteractInput,
} from './interact.js';
