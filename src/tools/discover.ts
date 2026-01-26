/**
 * Discover Tool
 *
 * Rich discovery that returns component info WITH current state and description.
 * Reduces agent thinking time by providing everything upfront.
 */

import { z } from 'zod';
import { getRegistry } from '../core/registry.js';

export const discoverSchema = z.object({
  id: z.string().optional().describe('Filter to specific component ID'),
  tag: z.string().optional().describe('Filter by tag'),
});

export type DiscoverInput = z.infer<typeof discoverSchema>;

/**
 * Discover exposed components with rich information.
 *
 * Returns:
 * - Component IDs and available keys
 * - Current state values (not just keys)
 * - Description to help agents understand the component
 *
 * This allows agents to understand and act in a single round trip.
 */
export async function discover(params: DiscoverInput) {
  const registry = getRegistry();
  const entries = registry.discover({
    id: params.id,
    tag: params.tag,
  });

  return {
    success: true,
    count: entries.length,
    components: entries.map((entry) => ({
      id: entry.id,
      keys: entry.keys,
      tags: entry.tags,
      description: entry.description,
      currentState: entry.currentState,
    })),
  };
}
