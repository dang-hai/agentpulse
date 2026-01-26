# AgentPulse

Let AI agents control your React app.

```tsx
useExpose('todo', { items, addItem, toggleItem, deleteItem });
```

Now Claude can interact with your UI directly.

## Setup

### With AI Assistant (Recommended)

```bash
npx add-skill dang-hai/agentpulse
```

Then ask Claude: *"Set up AgentPulse in my project"*

### Manual

```bash
npm install agentpulse
```

**1. Wrap your app**

```tsx
import { AgentPulseProvider } from 'agentpulse';

<AgentPulseProvider endpoint="ws://localhost:3100/ws">
  <App />
</AgentPulseProvider>
```

**2. Expose a component**

```tsx
import { useExpose } from 'agentpulse';

function TodoList() {
  const [items, setItems] = useState([]);

  useExpose('todo-list', {
    items,
    addItem: (text) => setItems([...items, { id: Date.now(), text }]),
    deleteItem: (id) => setItems(items.filter(i => i.id !== id)),
  });

  return <ul>{items.map(item => <li key={item.id}>{item.text}</li>)}</ul>;
}
```

**3. Start the server**

```bash
npx agentpulse
```

**4. Connect Claude**

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentpulse": { "url": "http://localhost:3100/mcp" }
  }
}
```

Done. Claude can now call `discover()` to see your components and interact with them.

## What to Expose

| Component | Expose |
|-----------|--------|
| Forms | `{ values, setField, submit, errors }` |
| Lists | `{ items, add, remove, toggle }` |
| Inputs | `{ value, setValue, clear }` |
| Modals | `{ isOpen, open, close }` |

Write a `description` to help the AI understand your component:

```tsx
useExpose('search', { query, setQuery, search }, {
  description: 'Search box. Use setQuery(text), then search() to execute.',
});
```

## Electron

```ts
// preload.ts
import { setupAgentPulse } from 'agentpulse/preload';
setupAgentPulse();

// main.ts
import { createServer } from 'agentpulse/main';
createServer({ ipcMain }).start();

// renderer - just use <AgentPulseProvider> without endpoint
```

## Links

- [Examples](./examples)
- [API Reference](./docs/api.md)
- [Electron Guide](./docs/electron.md)

## License

MIT
