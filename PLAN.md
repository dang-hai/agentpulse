# AgentPulse Library Design Plan

## Overview

AgentPulse makes React apps MCP-controllable. Components expose their state and actions via `useExpose()`, and AI agents interact with them through MCP tools.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React App (Browser)                                        │
│                                                             │
│  <AgentPulseProvider endpoint="ws://localhost:3100">       │
│       │                                                     │
│       ├── Establishes WebSocket connection                  │
│       ├── Provides transport context to children            │
│       ├── Handles incoming requests from server             │
│       │                                                     │
│       │   ┌─────────────────────────────────┐              │
│       └──▶│ useExpose('todo-input', {...})  │              │
│           │  - Registers to local registry   │              │
│           │  - Notifies server of registration│              │
│           └─────────────────────────────────┘              │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket (proxy operations)
┌───────────────────────────▼─────────────────────────────────┐
│  MCP Server (Node.js)                                       │
│                                                             │
│  - Accepts WebSocket connections from browsers              │
│  - Tracks registered components per connection              │
│  - Proxies MCP tool calls to browser, returns responses     │
│  - Exposes tools: discover, expose_get, expose_set,         │
│    expose_call, interact                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP Protocol
┌───────────────────────────▼─────────────────────────────────┐
│  MCP Client (Claude Code, etc.)                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. React Provider (`AgentPulseProvider`)

Wraps the app and manages the transport connection.

```tsx
import { AgentPulseProvider } from 'agentpulse';

function App() {
  return (
    <AgentPulseProvider endpoint="ws://localhost:3100">
      <MyApp />
    </AgentPulseProvider>
  );
}
```

**Responsibilities:**
- Establish WebSocket connection to MCP server
- Provide transport context to `useExpose` hooks
- Handle incoming proxy requests (get/set/call/list/discover)
- Execute requests against local registry
- Send responses back to server

### 2. `useExpose` Hook

Exposes component state and actions to MCP clients.

```tsx
import { useExpose } from 'agentpulse';

function TodoInput() {
  const [value, setValue] = useState('');

  useExpose('todo-input', {
    value,
    setValue,
    add: (text) => addTodo(text ?? value),
  }, {
    description: 'Input for adding todos. Use add(text) to create a todo.',
  });

  return <input value={value} onChange={e => setValue(e.target.value)} />;
}
```

**Responsibilities:**
- Register bindings to local registry
- Notify server of component registration (id, keys, description)
- Notify server on unmount (unregister)
- Keep bindings fresh via ref pattern (existing implementation)

### 3. Local Registry

In-memory store of exposed components (existing implementation, minimal changes).

```ts
class ExposeRegistry {
  register(id, bindings, options): () => void
  unregister(id): void
  list(filter?): ExposeInfo[]
  discover(filter?): DiscoverInfo[]
  get(id, key): GetResult
  set(id, key, value): SetResult
  call(id, key, args): Promise<CallResult>
}
```

### 4. Transport Protocol

Type-safe message protocol for browser ↔ server communication.

```ts
// Shared types (browser & server)
type Procedures = {
  // Server → Browser (proxy operations)
  list:       { input: { tag?: string };                              output: ExposeInfo[] };
  discover:   { input: { tag?: string; id?: string };                 output: DiscoverInfo[] };
  get:        { input: { id: string; key: string };                   output: GetResult };
  set:        { input: { id: string; key: string; value: unknown };   output: SetResult };
  call:       { input: { id: string; key: string; args: unknown[] };  output: CallResult };

  // Browser → Server (registration)
  register:   { input: { id: string; keys: string[]; description?: string }; output: void };
  unregister: { input: { id: string };                                output: void };
};

type Request<P extends keyof Procedures> = {
  id: string;
  method: P;
  params: Procedures[P]['input'];
};

type Response = {
  id: string;
  result?: unknown;
  error?: string;
};
```

### 5. MCP Server

Node.js server that bridges MCP clients and browser connections.

```ts
import { createServer } from 'agentpulse/server';

const server = createServer({ port: 3100 });
await server.start();
```

**Responsibilities:**
- HTTP endpoint for MCP protocol (`/mcp`)
- WebSocket endpoint for browser connections
- Track connected browsers and their registered components
- Proxy MCP tool calls to appropriate browser connection
- Return results to MCP client

## File Structure

```
src/
├── core/
│   ├── types.ts           # Shared types (ExposeInfo, etc.)
│   ├── registry.ts        # Local registry (existing, minimal changes)
│   └── protocol.ts        # Transport protocol types (NEW)
│
├── react/
│   ├── provider.tsx       # AgentPulseProvider (NEW)
│   ├── useExpose.ts       # Hook (MODIFY - add transport integration)
│   └── context.ts         # React context (NEW)
│
├── transport/
│   ├── types.ts           # Transport interface (NEW)
│   ├── websocket.ts       # WebSocket transport client (NEW)
│   └── local.ts           # Local/same-process transport (NEW)
│
├── server/
│   ├── mcp-server.ts      # MCP server (MODIFY - add WebSocket, proxy logic)
│   └── connections.ts     # Connection manager (NEW)
│
└── index.ts               # Public exports
```

## Implementation Steps

### Phase 1: Transport Protocol
1. Define `protocol.ts` with shared message types
2. Create transport interface in `transport/types.ts`
3. Implement `WebSocketTransport` client for browser

### Phase 2: React Integration
1. Create `AgentPulseContext` and `AgentPulseProvider`
2. Modify `useExpose` to:
   - Use transport from context (if available)
   - Send register/unregister messages
3. Provider handles incoming requests, executes against registry

### Phase 3: Server Updates
1. Add WebSocket server alongside HTTP/MCP
2. Create connection manager to track browsers and their components
3. Modify MCP tools to proxy through connections instead of local registry

### Phase 4: Testing & Example
1. Update todo-app example to use new provider
2. Test full flow: Claude Code → MCP Server → Browser → Response

## API Summary

### Browser (React App)

```tsx
// Provider
<AgentPulseProvider endpoint="ws://localhost:3100">
  {children}
</AgentPulseProvider>

// Hook
useExpose(id: string, bindings: Record<string, unknown>, options?: {
  description?: string;
  tags?: string[];
})

// Non-hook version (for non-React code)
expose(id, bindings, options): () => void
```

### Server (Node.js)

```ts
const server = createServer({
  port?: number;      // Default: 3100
  path?: string;      // MCP path, default: '/mcp'
  wsPath?: string;    // WebSocket path, default: '/ws'
});

await server.start();
await server.stop();
```

### MCP Tools (for agents)

| Tool | Description |
|------|-------------|
| `discover` | List components with descriptions and current state |
| `expose_list` | List component IDs and keys (lightweight) |
| `expose_get` | Get a value from a component |
| `expose_set` | Set a value on a component |
| `expose_call` | Call an action on a component |
| `interact` | Batch multiple operations in one call |

## Future Considerations (Not in scope now)

- Electron IPC transport
- Sync transport mode (for read-heavy workloads)
- Multiple browser connections (routing, broadcasting)
- Authentication/authorization
- Screenshots via browser API
