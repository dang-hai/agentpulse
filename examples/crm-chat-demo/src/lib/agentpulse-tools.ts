import { getRegistry } from 'agentpulse';

type ToolCallArgs = Record<string, unknown>;

interface ToolCall {
  toolName: string;
  args: ToolCallArgs;
}

export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  const registry = getRegistry();
  const { toolName, args } = toolCall;

  switch (toolName) {
    case 'discover': {
      const filter = args.id ? { id: args.id as string } : undefined;
      const results = registry.discover(filter);
      return JSON.stringify(results, null, 2);
    }

    case 'expose_list': {
      const results = registry.list();
      return JSON.stringify(results, null, 2);
    }

    case 'expose_get': {
      const { id, key } = args as { id: string; key: string };
      const result = registry.get(id, key);
      return JSON.stringify(result, null, 2);
    }

    case 'expose_set': {
      const { id, key, value } = args as { id: string; key: string; value: unknown };
      const result = registry.set(id, key, value);
      return JSON.stringify(result, null, 2);
    }

    case 'expose_call': {
      const { id, key, args: callArgs } = args as { id: string; key: string; args?: unknown[] };
      const result = await registry.call(id, key, callArgs || []);
      return JSON.stringify(result, null, 2);
    }

    case 'interact': {
      const { actions } = args as { actions: Array<{ type: string; id: string; key: string; value?: unknown; args?: unknown[] }> };
      const results = [];

      for (const action of actions) {
        if (action.type === 'set') {
          results.push(registry.set(action.id, action.key, action.value));
        } else if (action.type === 'call') {
          results.push(await registry.call(action.id, action.key, action.args || []));
        } else if (action.type === 'get') {
          results.push(registry.get(action.id, action.key));
        }
      }

      return JSON.stringify(results, null, 2);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
