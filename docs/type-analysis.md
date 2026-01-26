# Type Analysis: Optional Properties Audit

This document analyzes optional properties in the AgentPulse codebase to identify cases where "optional" actually represents an invalid state.

## Category 1: FALSE OPTIONALITY

These types allow invalid states that should be impossible.

### Response Type (protocol.ts:70-74)

```typescript
export type Response<P> = {
  id: string;
  result?: Procedures[P]['output'];  // Both optional
  error?: string;                     // Both optional
};
```

**Problem:** Allows four states but only two are valid:
| result | error | Valid? |
|--------|-------|--------|
| ✓ | ✗ | ✓ Success |
| ✗ | ✓ | ✓ Failure |
| ✗ | ✗ | ✗ Invalid - no outcome |
| ✓ | ✓ | ✗ Invalid - contradictory |

**Fix:** Use discriminated union:
```typescript
type Response<P> =
  | { id: string; result: Procedures[P]['output']; error?: never }
  | { id: string; result?: never; error: string };
```

### GetResult / CallResult (types.ts:65-80)

```typescript
export interface GetResult {
  success: boolean;
  value?: unknown;   // Should correlate with success
  error?: string;    // Should correlate with success
}
```

**Problem:** `success: true` should require `value`, `success: false` should require `error`. Current type allows `{ success: true }` (missing value) or `{ success: false }` (missing error).

**Fix:**
```typescript
type GetResult =
  | { success: true; value: unknown }
  | { success: false; error: string };
```

### IPCResponse (ipc.ts:28-31)

```typescript
interface IPCResponse {
  result?: unknown;
  error?: string;
}
```

**Problem:** Same as Response - both optional allows invalid states.

---

## Category 2: TRULY OPTIONAL

These are legitimately optional with sensible defaults or genuinely optional features.

### Configuration Options (with defaults)

| Interface | Property | Default |
|-----------|----------|---------|
| `WebSocketTransportOptions` | `reconnect?` | `true` |
| `WebSocketTransportOptions` | `reconnectDelay?` | `1000` |
| `WebSocketTransportOptions` | `maxReconnectAttempts?` | `10` |
| `AgentPulseServerOptions` | `host?` | `'localhost'` |
| `AgentPulseServerOptions` | `port?` | `3100` |
| `AgentPulseServerOptions` | `path?` | `'/mcp'` |
| `AgentPulseServerOptions` | `wsPath?` | `'/ws'` |
| `AgentPulseServerOptions` | `name?` | `'agentpulse'` |
| `AgentPulseServerOptions` | `version?` | `'1.0.0'` |
| `ElectronServerOptions` | (same pattern) | (same defaults) |

**Verdict:** ✓ OK - these have sensible defaults applied in constructors.

### Filter Parameters

| Location | Property | Meaning |
|----------|----------|---------|
| `Procedures['list']` | `tag?: string` | No filter = return all |
| `Procedures['discover']` | `tag?: string` | No filter = return all |
| `Procedures['discover']` | `id?: string` | No filter = return all |

**Verdict:** ✓ OK - absence means "no filter".

### User-Provided Metadata

| Interface | Property | Purpose |
|-----------|----------|---------|
| `ExposeOptions` | `description?` | Human-readable help |
| `ExposeOptions` | `tags?` | Filtering categories |
| `ExposeEntry` | `description?` | Propagated from options |
| `ExposeInfo` | `description?` | Propagated from entry |
| `LogEntry` | `meta?` | Extra context |

**Verdict:** ✓ OK - components work without descriptions.

### Optional Features

| Interface | Property | Purpose |
|-----------|----------|---------|
| `InteractOptions` | `observe?` | Enable observation |
| `InteractOptions.observe` | `screenshot?` | Capture screenshot |
| `InteractOptions.observe` | `logs?` | Capture logs |
| `InteractOptions.observe` | `waitFor?` | Wait for condition |
| `InteractOptions.observe.waitFor` | `timeout?` | Custom timeout |
| `InteractResult` | `screenshot?` | Only if requested |
| `InteractResult` | `logs?` | Only if requested |
| `InteractResult` | `finalState?` | Only if observed |

**Verdict:** ✓ OK - these enable optional capabilities.

### Global Window Extension

```typescript
declare global {
  interface Window {
    agentpulse?: AgentPulseBridge;
  }
}
```

**Verdict:** ✓ OK - may not exist in non-Electron environments.

---

## Category 3: INCONSISTENCIES

### Function Arguments (`args`)

The `args` parameter has inconsistent typing:

| Location | Type | Required? |
|----------|------|-----------|
| `protocol.ts:37` (call procedure) | `args: unknown[]` | Yes |
| `types.ts:85` (InteractAction) | `args?: unknown[]` | No |
| `mcp-server.ts:147` (tool handler) | `args?: unknown[]` | No |
| `mcp-server.ts:200` (interact action) | `args?: unknown[]` | No |
| `registry.ts:190` (call method) | `args: unknown[] = []` | No (default) |

**Problem:** Confusion about whether args is required. The registry handles it with a default, but the protocol says it's required.

**Recommendation:** Make it consistently optional with empty array default, or consistently required.

---

## Category 4: UNSAFE TYPE ASSERTIONS

Many `as` casts bypass type safety. These are trust boundaries where validation should occur.

### MCP Tool Args (mcp-server.ts, electron/main.ts)

```typescript
// mcp-server.ts:97, 113, 130, 147, 170, 198
const result = await this.proxyRequest('list', args as Procedures['list']['input']);
```

**Problem:** Relies on Zod validation upstream. If Zod schema doesn't match TypeScript type, this cast hides the mismatch.

**Mitigation:** Currently acceptable because Zod provides runtime validation, but a type mismatch between Zod schema and TypeScript interface would go unnoticed until runtime.

### Browser Message Handling (mcp-server.ts:288-324)

```typescript
private handleBrowserMessage(ws: WebSocket, data: string): void {
  const message = JSON.parse(data);  // any
  const pendingRequest = 'id' in message ? this.pending.get(message.id) : undefined;
  // ...
  const { id, keys, description, tags } = message.params;  // No validation!
}
```

**Problem:** `message` is `any` after JSON.parse. Properties accessed without type guards.

**Fix:** Add type guards like `isRequest()` / `isResponse()` (as done in websocket.ts and ipc.ts).

### IPC Incoming Request (ipc.ts:81)

```typescript
this.bridge.on('request', (data) => {
  this.handleIncomingRequest(data as Request);  // Unsafe cast
});
```

**Problem:** `data` is `unknown` but cast to `Request` without validation.

**Fix:** Use `isRequest()` type guard.

---

## Category 5: SILENT FAILURES

### WebSocket Send (websocket.ts:139)

```typescript
this.ws?.send(JSON.stringify(req));
```

**Problem:** If `ws` is null, message silently dropped. The `request()` method would hang until timeout.

**Status:** Partially fixed - response sending now logs error (line 216-218), but request sending still silently fails.

### Transport Registration Errors (useExpose.ts:102-104)

```typescript
transport.request('register', { ... }).catch(() => {
  // Silently ignore transport errors during registration
});
```

**Problem:** Registration failures are completely silent. If transport is in bad state, components appear registered locally but server doesn't know about them.

---

## Category 6: LOGIC ISSUES

### Value Comparison in waitForCondition (interact.ts:113)

```typescript
if (result.success && result.value === expectedValue) {
  return true;
}
```

**Problem:** Uses `===` for comparison. Works for primitives, fails for objects/arrays:
```typescript
// This will never match:
waitFor: { key: 'items', becomes: [] }  // [] === [] is false
```

**Fix:** Use deep equality (e.g., `JSON.stringify(result.value) === JSON.stringify(expectedValue)`) or document primitive-only limitation.

### null vs undefined Confusion (interact.ts:203)

```typescript
response.finalState = registry.getState(target) ?? undefined;
```

**Problem:** `getState()` returns `Record<string, unknown> | null`. This converts `null` to `undefined`. The type of `finalState` is `Record<string, unknown> | undefined`. This null/undefined conversion is confusing and masks the distinction.

### Dead Code (mcp-server.ts:416-417)

```typescript
const server = this.httpServer;
if (!server) return;  // Can never be true - just assigned on line 333
```

---

## Category 7: GLOBAL MUTABLE STATE

### interact.ts Module State

```typescript
let screenshotCapture: ScreenshotCapture | null = null;
let logBuffer: LogEntry[] = [];
let logCapturing = false;
```

**Problem:** Module-level mutable state shared across all callers. Not safe for:
- Concurrent `interact()` calls
- Multiple React roots
- Testing (state leaks between tests)

**Fix:** Consider passing these as parameters or using a context/scope object.

---

## Category 8: CODE DUPLICATION

### registerTools() Duplication

`mcp-server.ts:85-237` and `electron/main.ts:200-346` have nearly identical `registerTools()` methods.

**Fix:** Extract to shared module.

---

## Category 9: MISSING TYPE GUARDS

These files handle untrusted data but don't use type guards:

| File | Location | Data Source |
|------|----------|-------------|
| `mcp-server.ts` | `handleBrowserMessage()` | WebSocket message |
| `ipc.ts` | `bridge.on('request')` | IPC event |

Both websocket.ts and electron/main.ts have proper type guards - these two are inconsistent.

---

## Action Items

### High Priority (Type Safety) - COMPLETED
1. [x] Refactor `Response<P>` to discriminated union
2. [x] Refactor `GetResult` to discriminated union
3. [x] Refactor `CallResult` to discriminated union
4. [x] Refactor `IPCResponse` - now uses Response type with discriminated union
5. [x] Add type guards to `mcp-server.ts:handleBrowserMessage()` - uses parseMessage()
6. [x] Add type guard to `ipc.ts` incoming request handler - uses isRequest()

### Medium Priority (Correctness) - COMPLETED
7. [ ] Fix `waitForCondition` to use deep equality or document limitation (documented in types)
8. [x] Fix request sending in websocket.ts to not silently fail - captures ws before send
9. [x] Decide on null vs undefined strategy - standardized on undefined

### Low Priority (Code Quality) - PARTIALLY COMPLETED
10. [ ] Standardize `args` parameter across all interfaces (deferred)
11. [ ] Extract shared `registerTools()` logic to reduce duplication (deferred)
12. [x] Consider scoped state for interact.ts instead of module globals - uses context object
13. [ ] Remove dead code in mcp-server.ts:416-417 (deferred - minor)

### Additional Fixes
- [x] Registration errors now warn + have optional callback instead of silent failure
- [x] Created centralized parseMessage() with type guards in parse.ts
- [x] All transports use parseMessage() for consistent validation

### Accepted (Document Only)
- First connection wins (documented limitation)
- Zod `as` casts (acceptable with Zod runtime validation)
- `waitForCondition` uses `===` (works for primitives only - documented)
