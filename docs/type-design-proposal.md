# Type Design Patterns

This document describes the type patterns used in AgentPulse to ensure type safety and prevent silent bugs.

## 1. Result Types: Discriminated Unions

All operation results use discriminated unions. Success requires a value, failure requires an error.

```typescript
type Result<T> =
  | { success: true; value: T }
  | { success: false; error: string };

// Usage
type GetResult = Result<unknown>;
type SetResult = Result<void>;
type CallResult = Result<unknown>;
```

**Creating results:**
```typescript
return { success: true, value: data };
return { success: false, error: 'Component not found' };
```

**Consuming results:**
```typescript
if (result.success) {
  console.log(result.value);  // TypeScript knows value exists
} else {
  console.log(result.error);  // TypeScript knows error exists
}
```

## 2. Protocol Response Type

Response messages use the same pattern - result XOR error, never both.

```typescript
type Response<P> =
  | { id: string; result: Procedures[P]['output']; error?: never }
  | { id: string; result?: never; error: string };
```

## 3. Trust Boundaries: Centralized Parser

All incoming messages are validated through `parseMessage()`:

```typescript
const parsed = parseMessage(data);

switch (parsed.type) {
  case 'request':
    handleRequest(parsed.request);
    break;
  case 'response':
    handleResponse(parsed.response);
    break;
  case 'invalid':
    console.error('Invalid message:', parsed.reason);
    break;
}
```

## 4. Scoped State: Context Objects

Avoid module-level mutable state. Use context objects for request-scoped data:

```typescript
const ctx = createInteractContext({ captureScreenshot: myCapture });
await interact(params, ctx);

// Logs are scoped to this context
ctx.injectLog({ level: 'info', source: 'app', message: 'Hello' });
const logs = ctx.getLogs();
```

## 5. Explicit Failure Handling

Never silently drop errors. Either throw, return error result, or warn:

```typescript
// Bad: silent failure
this.ws?.send(data);

// Good: explicit handling
const ws = this.ws;
if (!ws) throw new Error('Not connected');
ws.send(data);
```

## 6. Consistent Absence Representation

Use `undefined` (not `null`) for absent optional values:

```typescript
// Good
getState(id: string): Record<string, unknown> | undefined

// Avoid
getState(id: string): Record<string, unknown> | null
```
