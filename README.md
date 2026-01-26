# AgentPulse

Make React apps MCP-controllable. One line to expose component state to AI agents.

```tsx
useExpose('chat-input', { value, setValue, send });
```

Now Claude Code (or any MCP client) can type, click, and interact with your React app.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  React App (Browser or Electron Renderer)                   │
│                                                             │
│  <AgentPulseProvider>                                       │
│       │                                                     │
│       └──▶ useExpose('todo-input', { value, setValue })     │
│                                                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ WebSocket (browser) or IPC (Electron)
┌───────────────────────────▼─────────────────────────────────┐
│  MCP Server (Node.js or Electron Main)                      │
│  - Proxies MCP tool calls to renderer                       │
│  - Tools: discover, expose_get, expose_set, expose_call     │
└───────────────────────────┬─────────────────────────────────┘
                            │ MCP Protocol
┌───────────────────────────▼─────────────────────────────────┐
│  MCP Client (Claude Code, etc.)                             │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install

```bash
npm install agentpulse
```

### 2. Wrap your app

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

### 3. Expose components

```tsx
import { useExpose } from 'agentpulse';

function ChatInput({ onSend }) {
  const [value, setValue] = useState('');

  useExpose('chat-input', { value, setValue, send: () => onSend(value) });

  return <input value={value} onChange={e => setValue(e.target.value)} />;
}
```

### 4. Start the server

```bash
npx agentpulse
```

### 5. Connect an MCP client

```bash
claude --mcp http://localhost:3100/mcp
```

Now the AI can discover and interact with your components:

```
> discover()           # See all exposed components
> expose_set('chat-input', 'value', 'Hello!')
> expose_call('chat-input', 'send')
```

## Electron Apps

For Electron apps, AgentPulse uses IPC instead of WebSocket. Three lines to integrate:

```typescript
// preload.ts
import { setupAgentPulse } from 'agentpulse/preload';
setupAgentPulse();
```

```typescript
// main.ts
import { ipcMain } from 'electron';
import { createServer } from 'agentpulse/main';

const server = createServer({ ipcMain });
await server.start();
```

```tsx
// renderer.tsx - zero config, auto-detects IPC
import { AgentPulseProvider } from 'agentpulse';

<AgentPulseProvider>
  <App />
</AgentPulseProvider>
```

The provider auto-detects `window.agentpulse` (set up by preload) and uses IPC transport automatically.

## MCP Tools

| Tool | Description |
|------|-------------|
| `discover` | List components with current state |
| `expose_list` | List component IDs and keys |
| `expose_get` | Get a value |
| `expose_set` | Set a value |
| `expose_call` | Call an action |
| `interact` | Batch multiple operations |

## Why AgentPulse?

| Without AgentPulse | With AgentPulse |
|-------------------|-----------------|
| Write custom automation endpoints | One hook per component |
| Build test harnesses | MCP client connects directly |
| Manual state inspection | `discover()` shows everything |

## Related

- **[use-mcp](https://github.com/anthropics/use-mcp)**: React app calls MCP tools (App → Server)
- **AgentPulse**: MCP clients control React app (Server ← App)

They're complementary! Use both if your app needs to call AI tools AND be controllable.

## License

MIT
