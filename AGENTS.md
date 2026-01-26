# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Code Style

- **Comments**: Use sparingly. Code should be self-documenting; only add comments for non-obvious logic.
- **Testing**: Follow TDD - write failing contract tests first and commit before implementation.

## Build and Development Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Watch mode compilation
npm run typecheck    # Type-check without emitting
npm run lint         # Run Biome linter
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Biome
```

## Architecture Overview

AgentPulse makes React apps controllable by MCP clients (like Claude Code). It bridges the renderer and MCP protocol through a three-tier architecture:

```
Browser/Renderer (React)  ←─WebSocket/IPC─→  MCP Server  ←─MCP─→  AI Client
```

### Core Modules

**Client-side (Browser/Renderer)**
- `src/core/useExpose.ts` - React hook that registers component state/actions to the registry. Uses a Proxy to keep bindings fresh without re-registration.
- `src/core/registry.ts` - Singleton `ExposeRegistry` storing all exposed bindings. Handles get/set/call operations on registered components.
- `src/transport/websocket.ts` - Browser-side WebSocket client. Receives requests from server, executes against local registry, returns results.
- `src/transport/ipc.ts` - Electron IPC transport. Same pattern as WebSocket but uses `window.agentpulse` bridge.
- `src/react/provider.tsx` - `AgentPulseProvider` context that creates transport and handles lifecycle. Auto-detects IPC bridge for Electron.

**Server-side (Node.js)**
- `src/server/mcp-server.ts` - HTTP server with two roles:
  1. MCP endpoint (`/mcp`) - Registers tools (`expose_list`, `expose_get`, `expose_set`, `expose_call`, `discover`, `interact`) and handles MCP protocol
  2. WebSocket endpoint (`/ws`) - Accepts browser connections, proxies MCP tool calls to connected browsers
- `src/cli.ts` - CLI entry point (`npx agentpulse`)

**Electron-specific**
- `src/electron/preload.ts` - `setupAgentPulse()` exposes IPC bridge via contextBridge
- `src/electron/main.ts` - `ElectronServer` - IPC handlers + MCP server for Electron main process

**Protocol (`src/core/protocol.ts`)**
- Type-safe request/response protocol for browser↔server communication
- Procedures: `list`, `discover`, `get`, `set`, `call`, `register`, `unregister`

### Data Flow

1. React component calls `useExpose('id', { value, setValue, action })`
2. Bindings registered to singleton `ExposeRegistry` + notified to server via WebSocket
3. MCP client calls tool (e.g., `expose_set`)
4. Server proxies request to browser via WebSocket
5. Browser's `WebSocketTransport` executes against `ExposeRegistry`
6. Result flows back through WebSocket → MCP response

### Binding Types

The registry supports three binding patterns:
- **Values**: Read-only state (primitives)
- **Accessors**: `{ get: () => T, set: (v: T) => void }` for read-write state
- **Functions**: Callable actions, `setXxx` naming convention auto-detected as setters

## Package Exports

- `agentpulse` - React hooks and components (`useExpose`, `AgentPulseProvider`, `createIPCTransport`)
- `agentpulse/server` - Server-side for browser apps (`createServer`, `AgentPulseServer`)
- `agentpulse/preload` - Electron preload script (`setupAgentPulse`)
- `agentpulse/main` - Electron main process (`createServer`, `ElectronServer`)
