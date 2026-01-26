# Electron Setup Guide

AgentPulse uses IPC instead of WebSocket for Electron apps. This provides better security and performance.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Renderer Process                                       │
│  <AgentPulseProvider> auto-detects window.agentpulse    │
└───────────────────────────┬─────────────────────────────┘
                            │ IPC (via contextBridge)
┌───────────────────────────▼─────────────────────────────┐
│  Main Process                                           │
│  ElectronServer handles IPC + exposes MCP endpoint      │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP/MCP
┌───────────────────────────▼─────────────────────────────┐
│  MCP Client (Claude Code, etc.)                         │
└─────────────────────────────────────────────────────────┘
```

## Step 1: Configure Preload Script

In your preload script (e.g., `preload.ts` or `electron/preload.ts`):

```typescript
import { setupAgentPulse } from 'agentpulse/preload';

// Call this to expose the IPC bridge
setupAgentPulse();

// Your other preload code...
```

**Important**: Your `BrowserWindow` must have `contextIsolation: true` (default in modern Electron).

## Step 2: Configure Main Process

In your main process entry (e.g., `main.ts` or `electron/main.ts`):

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { createServer } from 'agentpulse/main';

let mainWindow: BrowserWindow | null = null;
let agentPulseServer: ReturnType<typeof createServer> | null = null;

app.whenReady().then(async () => {
  // Create your window
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  // Start AgentPulse server
  agentPulseServer = createServer({ ipcMain });
  await agentPulseServer.start();

  console.log(`AgentPulse MCP server running at ${agentPulseServer.url}`);
});

app.on('window-all-closed', async () => {
  if (agentPulseServer) {
    await agentPulseServer.stop();
  }
  app.quit();
});
```

## Step 3: Configure Renderer

The renderer setup is simpler than web apps - no endpoint needed:

```tsx
import { AgentPulseProvider } from 'agentpulse';

function App() {
  return (
    <AgentPulseProvider>
      {/* Your app content */}
    </AgentPulseProvider>
  );
}
```

The provider automatically detects `window.agentpulse` (set up by preload) and uses IPC transport.

## Server Options

```typescript
createServer({
  ipcMain,                    // Required: Electron's ipcMain module
  channel: 'agentpulse',      // IPC channel prefix (default: 'agentpulse')
  port: 3100,                 // HTTP port for MCP (default: 3100)
  host: 'localhost',          // HTTP host (default: 'localhost')
  path: '/mcp',               // MCP endpoint path (default: '/mcp')
  name: 'my-electron-app',    // Server name in MCP (default: 'agentpulse')
  version: '1.0.0',           // Server version (default: '1.0.0')
});
```

## Electron Forge / Electron Builder

If using Electron Forge or Electron Builder, ensure `agentpulse` is not bundled incorrectly:

**electron-builder** (`electron-builder.yml`):
```yaml
files:
  - "!node_modules/agentpulse/dist/server/**"  # Server code is main-process only
```

**Electron Forge** (`forge.config.js`):
```javascript
module.exports = {
  packagerConfig: {
    ignore: [/node_modules\/agentpulse\/dist\/server/],
  },
};
```

## Multiple Windows

AgentPulse supports multiple renderer windows. Each window registers independently:

```typescript
// Each BrowserWindow that loads AgentPulseProvider will connect
const win1 = new BrowserWindow({ /* ... */ });
const win2 = new BrowserWindow({ /* ... */ });

// MCP tools will see components from all connected windows
// Use component IDs to distinguish between windows if needed
```

## Debugging

Check connection status in the renderer:

```typescript
import { useAgentPulse } from 'agentpulse';

function DebugPanel() {
  const { isConnected } = useAgentPulse();
  return <div>AgentPulse: {isConnected ? 'Connected' : 'Disconnected'}</div>;
}
```

Check main process logs for connection events:
```
[AgentPulse] Renderer 1 connected
[AgentPulse] Electron MCP server started at http://localhost:3100/mcp
```
