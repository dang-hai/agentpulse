---
name: agentpulse
description: |
  Help write useExpose hooks to make React components controllable by AI agents.
  Use when: exposing a component to AgentPulse, writing useExpose bindings, deciding what to expose,
  or improving descriptions for AI agents. For initial project setup, use "agentpulse-setup" instead.
license: MIT
compatibility: React >=18 with AgentPulse installed.
metadata:
  author: agentpulse
  version: "1.0"
allowed-tools: Read Write Edit Glob
---

# AgentPulse Component Exposure

Help users write effective `useExpose` hooks to make React components controllable by AI agents.

## Quick Reference

```tsx
import { useExpose } from 'agentpulse';

useExpose('component-id', {
  // State (read-only) - AI can read
  value,
  items,
  isLoading,

  // Setters (read-write) - AI can modify (auto-detected by setXxx naming)
  setValue,
  setFilter,

  // Actions (callable) - AI can call
  submit,
  refresh,
  clear,
}, {
  description: 'What it is. How to use it. What to expect.',
  tags: ['category'],
});
```

## What to Expose

Expose components users interact with:

| Component Type | Expose | Example ID |
|---------------|--------|------------|
| Text inputs | value, setValue, clear | `search-input` |
| Forms | fields, setters, submit, errors | `login-form` |
| Lists | items, add, remove, toggle | `todo-list` |
| Selection lists | items, selectedIds, select/deselect | `file-list` |
| Toggles | enabled, toggle/enable/disable | `dark-mode` |
| Navigation | current, navigate, tabs | `router` |
| Modals | isOpen, open, close, confirm | `confirm-dialog` |
| Async data | data, loading, error, refresh | `user-profile` |

**Don't expose**: Layout components, pure displays with no interaction, internal implementation details.

## Writing Good Descriptions

Descriptions tell the AI how to use your component. They're critical.

**Formula**: `[What it is]. [How to use it]. [What to expect/check].`

**Bad**:
- `"User form"` - What can AI do?
- `"Handles input"` - Too vague

**Good**:
- `"Login form. Set email/password with setters, then submit(). Check errors object for validation issues."`
- `"Todo list. Use add(text) to create, toggle(id) to complete, remove(id) to delete."`
- `"Search box. Use setQuery(text), then search(). Check loading, read results when done."`

## Common Patterns

### Input Field
```tsx
useExpose('search-input', {
  value,
  setValue,
  clear: () => setValue(''),
  submit: () => onSearch(value),
}, {
  description: 'Search input. Use setValue(text), then submit() to search. clear() resets.',
});
```

### Form with Validation
```tsx
useExpose('signup-form', {
  email, setEmail,
  password, setPassword,
  errors,          // { email?: string, password?: string }
  isValid,         // boolean
  isSubmitting,
  submit,
  reset,
}, {
  description: 'Signup form. Fill fields with setters. Check errors/isValid before submit(). Check isSubmitting for loading.',
});
```

### List with CRUD
```tsx
useExpose('todo-list', {
  items,           // Array of { id, text, completed }
  count: items.length,
  add: (text) => addItem(text),
  toggle: (id) => toggleItem(id),
  remove: (id) => removeItem(id),
  clear: () => clearAll(),
}, {
  description: 'Todo list. Use add(text) to create, toggle(id) to check/uncheck, remove(id) to delete.',
});
```

### List with Selection
```tsx
useExpose('file-list', {
  files,
  selectedIds,
  select: (id) => /* ... */,
  deselect: (id) => /* ... */,
  selectAll: () => /* ... */,
  clearSelection: () => /* ... */,
  deleteSelected: () => /* ... */,
}, {
  description: 'File list. Use select(id)/deselect(id) to choose files. selectAll()/clearSelection() for bulk. deleteSelected() removes chosen files.',
});
```

### Async Data
```tsx
useExpose('user-data', {
  user,
  loading,
  error,
  refresh: () => fetchUser(),
}, {
  description: 'User data. Read user object. Check loading/error states. Call refresh() to reload.',
});
```

### Modal/Dialog
```tsx
useExpose('confirm-dialog', {
  isOpen,
  open: (message) => showDialog(message),
  close: () => hideDialog(),
  confirm: () => { onConfirm(); close(); },
}, {
  description: 'Confirmation dialog. Use open(message) to show. confirm() or close() to respond.',
});
```

## Binding Types

AgentPulse auto-detects types:

| Pattern | Type | AI Access |
|---------|------|-----------|
| `value` (primitive/object) | Value | Read |
| `setValue` (function named `set*`) | Setter | Read + Write |
| `submit` (other function) | Action | Call |
| `{ get, set }` | Accessor | Read + Write |

## Tags for Organization

```tsx
useExpose('login-form', bindings, { tags: ['auth', 'form'] });
useExpose('profile-form', bindings, { tags: ['auth', 'form'] });
```

AI can filter: `discover({ tag: 'auth' })`

## Process for Exposing a Component

1. **Identify the component** - What interactive element needs AI control?
2. **List user actions** - What can a user do? (type, click, select, submit)
3. **Map to bindings** - State → values, User actions → setters/functions
4. **Write description** - What, how, what to expect
5. **Add useExpose** - Import hook, add call inside component
6. **Test with discover()** - Verify it appears in MCP client

## More Patterns

See `references/EXPOSE_PATTERNS.md` for:
- Multi-step forms/wizards
- Filtered/sorted/paginated lists
- Navigation patterns
- State management integration (Redux/Zustand)
- Testing exposed components
