# Troubleshooting AgentPulse

## Connection Issues

### "WebSocket connection failed" or "ECONNREFUSED"

**Cause**: AgentPulse server is not running or wrong port.

**Solution**:
1. Start the server: `npx agentpulse --port 3100`
2. Verify it's running: `curl http://localhost:3100/mcp` should return MCP response
3. Check the endpoint in your provider matches: `ws://localhost:3100/ws`

### "No renderer connected" when calling MCP tools

**Cause**: Browser hasn't connected to the WebSocket server.

**Solution**:
1. Check browser console for WebSocket errors
2. Ensure `AgentPulseProvider` wraps your component tree
3. Refresh the browser page
4. Verify CORS isn't blocking (server logs will show connection attempts)

### Components not appearing in `discover()` or `expose_list()`

**Cause**: Components not mounted or not wrapped by provider.

**Solution**:
1. Ensure `AgentPulseProvider` is at the root of your app
2. Check that components with `useExpose` are actually rendered
3. Verify the component ID is unique (duplicates overwrite each other)
4. Check browser console for AgentPulse errors

## Electron-Specific Issues

### "Cannot find module 'electron'" in preload

**Cause**: Preload script bundled incorrectly.

**Solution**:
1. Ensure preload isn't being bundled by your renderer bundler
2. Add `electron` to externals in your bundler config
3. Check `contextIsolation: true` in BrowserWindow options

### IPC not working / window.agentpulse undefined

**Cause**: Preload script not loaded or contextBridge failed.

**Solution**:
1. Verify preload path in BrowserWindow is correct
2. Check main process console for preload errors
3. Ensure `setupAgentPulse()` is called in preload
4. Verify `contextIsolation: true` (required for contextBridge)

### "Renderer X disconnected" immediately after connecting

**Cause**: Window closed or navigated away.

**Solution**:
1. Check if page is reloading/navigating
2. Ensure no errors crash the renderer
3. Check for multiple windows with same preload

## Network/Permissions Issues

### Port 3100 already in use

**Solution**:
```bash
# Find what's using the port
lsof -i :3100

# Use a different port
npx agentpulse --port 3101
```

Update your provider endpoint accordingly.

### Firewall blocking connections

**Solution**:
1. Allow Node.js through firewall
2. For development, server binds to `localhost` by default (local only)
3. For network access, use `--host 0.0.0.0` (be careful in production)

### CORS errors in browser console

**Cause**: Browser blocking cross-origin WebSocket.

**Solution**:
1. AgentPulse server includes CORS headers by default
2. If using a proxy, ensure it forwards WebSocket upgrades
3. Check that the origin matches what server expects

## MCP Client Issues

### Claude Desktop not connecting

**Solution**:
1. Verify config file path:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Validate JSON syntax in config file
3. Restart Claude Desktop after config changes
4. Check that URL uses `http://` not `ws://` for MCP endpoint

### Tools returning empty results

**Cause**: No components exposed or server not connected to browser.

**Solution**:
1. Run `discover()` to check what's available
2. Verify browser is connected (check server logs)
3. Ensure components are mounted before calling tools

## Performance Issues

### High memory usage

**Cause**: Too many exposed bindings or large state objects.

**Solution**:
1. Expose only necessary state (not entire stores)
2. Use derived/computed values instead of raw data
3. Avoid exposing large arrays directly

### Slow `discover()` responses

**Cause**: Many components or complex state serialization.

**Solution**:
1. Reduce number of exposed components
2. Simplify exposed state shapes
3. Use `expose_list()` for just IDs, `discover()` only when needed

## Debug Mode

Enable verbose logging:

```tsx
<AgentPulseProvider
  endpoint="ws://localhost:3100/ws"
  debug={true}  // Logs all messages
>
```

Server-side:
```bash
DEBUG=agentpulse:* npx agentpulse
```
