# Type Design Proposal: Eliminating Silent Bugs

This document proposes a cohesive design to address the type safety issues identified in `type-analysis.md`.

## Design Principles

1. **Make invalid states unrepresentable** - The type system should reject impossible combinations
2. **Fail explicitly at boundaries** - Validate where untrusted data enters, fail loudly if invalid
3. **Consistent patterns** - Same problem → same solution everywhere
4. **Developer ergonomics** - Easy to use correctly, hard to use incorrectly

---

## Issue 1: Result Types Allow Invalid States

### Current Problem

```typescript
interface GetResult {
  success: boolean;
  value?: unknown;   // Can be missing when success=true
  error?: string;    // Can be missing when success=false
}
```

This allows four states but only two are valid:

| success | value | error | Valid? |
|---------|-------|-------|--------|
| true | present | absent | ✓ |
| false | absent | present | ✓ |
| true | absent | absent | ✗ Missing value |
| false | absent | absent | ✗ Missing error |

### Design Options

#### Option A: Discriminated Union (Recommended)

```typescript
type GetResult =
  | { success: true; value: unknown }
  | { success: false; error: string };
```

**Implications:**

| Aspect | Impact |
|--------|--------|
| Type safety | ✓ Invalid states are compile errors |
| Pattern matching | ✓ `if (result.success)` narrows type automatically |
| Creating results | Slightly more explicit - must include required fields |
| Consuming results | Easier - no need to check for undefined |
| Migration | Breaking change for any code checking `result.value` without narrowing |

**Usage after fix:**
```typescript
// Creating
return { success: true, value: data };      // ✓
return { success: false, error: 'failed' }; // ✓
return { success: true };                    // ✗ Compile error

// Consuming
if (result.success) {
  console.log(result.value);  // ✓ TypeScript knows value exists
} else {
  console.log(result.error);  // ✓ TypeScript knows error exists
}
```

#### Option B: Shared Result<T> Type

```typescript
type Result<T, E = string> =
  | { success: true; value: T }
  | { success: false; error: E };

// Usage
type GetResult = Result<unknown>;
type CallResult = Result<unknown>;
type SetResult = Result<void>;
```

**Additional implications:**
- Enables helper functions: `isSuccess(r)`, `unwrap(r)`, `unwrapOr(r, default)`
- More abstraction to learn
- Consistent vocabulary across codebase

#### Option C: Keep Current Structure + Runtime Assertions

```typescript
function assertGetResult(r: GetResult): asserts r is GetResult {
  if (r.success && r.value === undefined) throw new Error('Invalid result');
  if (!r.success && !r.error) throw new Error('Invalid result');
}
```

**Why this is worse:**
- Validation is optional and easy to forget
- Invalid states still representable
- Runtime errors instead of compile errors

### Recommendation: Option B (Shared Result Type)

Provides consistency and enables helper utilities. The abstraction pays for itself.

---

## Issue 2: Response Type (Protocol Layer)

### Current Problem

```typescript
type Response<P> = {
  id: string;
  result?: Procedures[P]['output'];
  error?: string;
};
```

### Design Options

#### Option A: Mirror the Result pattern

```typescript
type Response<P> = { id: string } & (
  | { result: Procedures[P]['output']; error?: never }
  | { result?: never; error: string }
);
```

The `error?: never` trick prevents the property from being present.

#### Option B: Use `ok` discriminator

```typescript
type Response<P> = { id: string } & (
  | { ok: true; result: Procedures[P]['output'] }
  | { ok: false; error: string }
);
```

**Trade-off:** Adds a field but is more explicit.

#### Option C: Align with Result<T>

```typescript
type Response<P> = { id: string } & Result<Procedures[P]['output']>;
```

**Benefit:** Same pattern as GetResult/CallResult. Learn once, use everywhere.

### Recommendation: Option C

Aligns protocol layer with application layer. One mental model.

---

## Issue 3: Trust Boundaries and Type Guards

### Current Problem

Data crosses trust boundaries without validation:

```
JSON.parse(data) → any → used directly
IPC callback(data) → unknown → cast as Request
```

Some files have type guards, some don't. Inconsistent.

### Design: Centralized Validated Parsers

Create a `protocol/parse.ts` module:

```typescript
// Types
type ParsedMessage =
  | { type: 'request'; request: Request }
  | { type: 'response'; response: Response }
  | { type: 'invalid'; raw: unknown };

// Parser
function parseMessage(data: string): ParsedMessage {
  try {
    const json: unknown = JSON.parse(data);

    if (isRequest(json)) {
      return { type: 'request', request: json };
    }
    if (isResponse(json)) {
      return { type: 'response', response: json };
    }
    return { type: 'invalid', raw: json };
  } catch {
    return { type: 'invalid', raw: data };
  }
}
```

**Usage at boundaries:**

```typescript
// Before (mcp-server.ts)
private handleBrowserMessage(ws: WebSocket, data: string): void {
  const message = JSON.parse(data);  // any - dangerous
  if ('id' in message) { ... }       // No validation
}

// After
private handleBrowserMessage(ws: WebSocket, data: string): void {
  const parsed = parseMessage(data);

  switch (parsed.type) {
    case 'response':
      this.handleResponse(parsed.response);
      break;
    case 'request':
      this.handleRequest(ws, parsed.request);
      break;
    case 'invalid':
      console.error('[AgentPulse] Invalid message:', parsed.raw);
      break;
  }
}
```

**Implications:**

| Aspect | Impact |
|--------|--------|
| Safety | ✓ All paths through parser are typed |
| Consistency | ✓ Same parsing everywhere |
| Debuggability | ✓ Invalid messages logged with context |
| Performance | Negligible - one extra function call |
| Maintenance | Single place to update validation logic |

### Alternative: Zod Schemas for Protocol

```typescript
const RequestSchema = z.object({
  id: z.string(),
  method: z.string(),
  params: z.unknown(),
});

const ResponseSchema = z.discriminatedUnion('success', [
  z.object({ id: z.string(), success: z.literal(true), value: z.unknown() }),
  z.object({ id: z.string(), success: z.literal(false), error: z.string() }),
]);
```

**Trade-off:** More robust validation, but adds Zod dependency to protocol layer (currently only in tools).

### Recommendation: Type Guards First, Zod Later

Start with type guards for consistency with existing code. Migrate to Zod if protocol grows more complex.

---

## Issue 4: Silent Failures

### Problem A: WebSocket Send Drops Silently

```typescript
// websocket.ts:139
this.ws?.send(JSON.stringify(req));  // If ws is null, nothing happens
```

The `request()` method returns a Promise that will hang until timeout.

### Design Options

| Option | Behavior | Trade-off |
|--------|----------|-----------|
| Throw immediately | `if (!this.ws) throw new Error('Not connected')` | Fast failure, but caller must handle |
| Return rejected Promise | Same semantics as throw in async context | Consistent with async pattern |
| Check in request() | Already checks `isConnected()`, but ws could become null between check and send | Race condition window |

**Recommended fix:**

```typescript
async request<P extends ProcedureName>(...): Promise<...> {
  if (!this.connected || !this.ws) {
    throw new Error('Not connected');
  }

  const id = crypto.randomUUID();
  const req: Request<P> = { id, method, params };

  return new Promise((resolve, reject) => {
    // Double-check ws still exists (could disconnect between check and here)
    if (!this.ws) {
      reject(new Error('Connection lost'));
      return;
    }

    this.pending.set(id, { resolve, reject });
    this.ws.send(JSON.stringify(req));
  });
}
```

### Problem B: Registration Errors Silently Ignored

```typescript
// useExpose.ts
transport.request('register', {...}).catch(() => {
  // Silently ignore
});
```

**Context:** This runs during React render. Throwing would crash the app.

**Design question:** What SHOULD happen?

| Option | Behavior | Trade-off |
|--------|----------|-----------|
| Keep silent | Current behavior | Masks real problems |
| Console.warn | Developer sees issue | Doesn't block app |
| Callback prop | `onRegistrationError?: (id: string, error: Error) => void` | App can decide |
| State flag | Expose `registrationFailed` from hook | App can show UI |

**Recommended:** Console.warn + optional callback

```typescript
transport.request('register', {...}).catch((error) => {
  console.warn(`[AgentPulse] Failed to register "${id}":`, error.message);
  options.onRegistrationError?.(error);
});
```

---

## Issue 5: Global Mutable State in interact.ts

### Current Problem

```typescript
let screenshotCapture: ScreenshotCapture | null = null;
let logBuffer: LogEntry[] = [];
let logCapturing = false;
```

Shared across all callers. Race conditions with concurrent requests.

### Design Options

#### Option A: Request-Scoped Context Object

```typescript
interface InteractContext {
  captureScreenshot?: ScreenshotCapture;
  injectLog: (entry: LogEntry) => void;
}

async function interact(
  params: InteractInput,
  context?: InteractContext
): Promise<InteractResult> {
  const logs: LogEntry[] = [];
  const injectLog = (entry: LogEntry) => logs.push(entry);

  // ... use logs array scoped to this request
}
```

**Trade-off:** Callers must pass context, but each request is isolated.

#### Option B: Factory Function

```typescript
function createInteractHandler(config: { captureScreenshot?: ScreenshotCapture }) {
  return async function interact(params: InteractInput): Promise<InteractResult> {
    const logs: LogEntry[] = [];  // Scoped to this call
    // ...
  };
}

// Usage
const interact = createInteractHandler({ captureScreenshot: myCapture });
await interact({ target: 'x', actions: [...] });
```

**Trade-off:** Slightly more setup, but clean separation.

#### Option C: Class-Based

```typescript
class InteractSession {
  private logs: LogEntry[] = [];

  constructor(private config: InteractConfig) {}

  async execute(params: InteractInput): Promise<InteractResult> {
    this.logs = [];  // Reset for this execution
    // ...
  }

  injectLog(entry: LogEntry): void {
    this.logs.push(entry);
  }
}
```

### Recommendation: Option A (Context Object)

Minimal change, explicit dependencies, testable.

---

## Issue 6: Null vs Undefined Inconsistency

### Current Problem

```typescript
// registry.ts
getState(id: string): Record<string, unknown> | null  // Returns null

// types.ts
finalState?: Record<string, unknown>  // Uses undefined

// interact.ts
response.finalState = registry.getState(target) ?? undefined;  // Converts null → undefined
```

### Design Decision: Pick One

| Choice | Rationale |
|--------|-----------|
| `null` everywhere | Explicit "no value" - matches JSON |
| `undefined` everywhere | TypeScript optional property convention |
| `null` for explicit absence, `undefined` for optional | Semantic distinction but confusing |

**Recommendation:** `undefined` for optional fields (TypeScript convention)

Change `registry.getState()` to return `undefined` instead of `null`:

```typescript
getState(id: string): Record<string, unknown> | undefined {
  const entry = this.entries.get(id);
  if (!entry) return undefined;  // Was: return null
  // ...
}
```

---

## Migration Strategy

### Phase 1: Non-Breaking Improvements
1. Add type guards to mcp-server.ts and ipc.ts
2. Add console.warn for registration failures
3. Fix null → undefined in registry.getState

### Phase 2: Result Type Refactor
1. Create `Result<T>` type
2. Migrate GetResult, SetResult, CallResult
3. Update all creation sites
4. Update all consumption sites

### Phase 3: Protocol Alignment
1. Update Response type to use Result pattern
2. Create centralized parseMessage()
3. Update all transport handlers

### Phase 4: State Isolation
1. Refactor interact.ts to use context object
2. Update MCP server tool handlers

---

## Summary

| Issue | Solution | Breaking? |
|-------|----------|-----------|
| Result types | Discriminated union with `Result<T>` | Yes - consumption changes |
| Response type | Align with `Result<T>` | Yes - protocol change |
| Type guards | Centralized `parseMessage()` | No |
| Silent send | Check + throw before send | No |
| Silent registration | Console.warn + callback | No |
| Global state | Context object parameter | No |
| null vs undefined | Standardize on undefined | Minor |

The discriminated union changes are breaking but provide the most value. They turn runtime bugs into compile errors.
