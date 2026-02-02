# Element Targeting Patterns

This reference covers how VisualOverlay finds DOM elements to animate.

## Naming Convention

The target resolver normalizes binding keys before matching:

```
bindingKey → normalizedKey
```

**Rules:**
1. Remove `set` prefix if present: `setName` → `Name`
2. Lowercase the result: `Name` → `name`

**Examples:**

| Binding Key | Normalized Key | Target Attribute |
|-------------|----------------|------------------|
| `setName` | `name` | `data-agentpulse-id="form-name"` |
| `setEmail` | `email` | `data-agentpulse-id="form-email"` |
| `setFormField` | `formfield` | `data-agentpulse-id="form-formfield"` |
| `submitForm` | `submitform` | `data-agentpulse-id="form-submitform"` |
| `search` | `search` | `data-agentpulse-id="search-search"` |
| `query` | `query` | `data-agentpulse-id="search-query"` |
| `setValue` | `value` | `data-agentpulse-id="input-value"` |

**Important:** The normalization only removes the `set` prefix, not other common prefixes like `on`, `handle`, etc.

---

## Fallback Chain

When resolving `componentId.key`, the resolver tries these strategies in order:

### Strategy 1: Explicit Selector Config

If a CSS selector is configured via `targets` prop or `setAnimationConfig()`:

```tsx
<VisualOverlay
  targets={{
    'contact-form': {
      name: '#custom-name-input',
    },
  }}
/>
```

The resolver uses that selector directly.

### Strategy 2: data-agentpulse-id Attribute

```tsx
<input data-agentpulse-id="contact-form-name" />
```

Query: `[data-agentpulse-id="componentId-normalizedKey"]`

### Strategy 3: Form Container with Input by Name

```tsx
<form data-agentpulse-id="contact-form">
  <input name="name" />
</form>
```

Query: `[data-agentpulse-id="componentId"] [name="normalizedKey"]`

Also tries placeholder: `[data-agentpulse-id="componentId"] input[placeholder*="normalizedKey" i]`

### Strategy 4: Input/Textarea by Name

```tsx
<input name="name" />
```

Query: `input[name="normalizedKey"], textarea[name="normalizedKey"]`

### Strategy 5: Element by ID

```tsx
<input id="name" />
<!-- or -->
<input id="contact-form-name" />
```

Query: `getElementById(normalizedKey)` or `getElementById(componentId-normalizedKey)`

### Strategy 6: Input by Placeholder

```tsx
<input placeholder="Enter your name" />
```

Query: `input[placeholder*="normalizedKey" i]` (case-insensitive)

### Strategy 7: Element by Aria Label

```tsx
<input aria-label="Name field" />
```

Query: `[aria-label*="normalizedKey" i]` (case-insensitive)

### Strategy 8: Submit Button Detection

For keys containing "submit" (like `submitForm`):

```tsx
<button type="submit">Save</button>
```

Tries:
1. `[data-agentpulse-id="componentId"] button[type="submit"]`
2. `form button[type="submit"]`
3. `button[type="submit"]`

### Strategy 9: Open/Close Button Detection

For keys containing "open" or "close":

Tries to find buttons with text "Add" (for open) or "Cancel" (for close).

---

## CSS Selector Config

### Via Props

```tsx
<VisualOverlay
  targets={{
    'contact-form': {
      name: 'input[name="fullName"]',
      email: 'input[type="email"]',
      submit: 'button[type="submit"]',
    },
    'search': {
      query: '#search-input',
      search: '#search-button',
    },
  }}
/>
```

### Via API

```tsx
import { setAnimationConfig, clearAnimationConfig } from 'agentpulse';

// Set config
setAnimationConfig({
  'my-form': {
    username: '#username-input',
    password: '#password-input',
  },
});

// Later: clear all config
clearAnimationConfig();
```

### When to Use Selectors

Use explicit selectors when:
- Third-party components have complex DOM structures
- Multiple forms have similar field names
- Auto-discovery picks the wrong element
- You need precise control over targeting

---

## Third-Party Component Strategies

### Material UI (MUI)

**TextField:**
```tsx
<TextField
  inputProps={{ 'data-agentpulse-id': 'form-email' }}
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

**Select:**
```tsx
// Use CSS selector for the hidden input
<VisualOverlay
  targets={{
    'form': {
      country: '.MuiSelect-root input',
    },
  }}
/>
```

### Chakra UI

```tsx
<Input data-agentpulse-id="form-email" />

// Or for complex components
<VisualOverlay
  targets={{
    'form': {
      email: '.chakra-input',
    },
  }}
/>
```

### Radix UI / shadcn

```tsx
<Input data-agentpulse-id="form-email" className="..." />

// Radix Select
<VisualOverlay
  targets={{
    'form': {
      category: '[data-radix-select-trigger]',
    },
  }}
/>
```

### Ant Design

```tsx
<Input data-agentpulse-id="form-email" />

// Or target the inner input
<VisualOverlay
  targets={{
    'form': {
      email: '.ant-input',
    },
  }}
/>
```

---

## Debug Techniques

### Console Logs

The target resolver logs its resolution attempts:

```
[TargetResolver] Found element for contact-form.name using selector: #custom-name-input
[TargetResolver] Auto-discovered element for contact-form.email
[TargetResolver] No element found for contact-form.phone
```

### Inspect Data Attributes

In browser DevTools:

```javascript
// Find all agentpulse-targeted elements
document.querySelectorAll('[data-agentpulse-id]')

// Check specific element
document.querySelector('[data-agentpulse-id="contact-form-name"]')
```

### Test Resolution

```javascript
import { getTargetResolver } from 'agentpulse';

const resolver = getTargetResolver();
const element = resolver.resolve('contact-form', 'setName');
console.log('Resolved to:', element);
```

### DATA_ATTR Constant

The data attribute name is defined as a constant in the source:

```typescript
// From target-resolver.ts
const query = `[data-agentpulse-id="${componentId}-${normalizedKey}"]`;
```

---

## Common Issues

### Wrong Element Selected

**Symptom:** Cursor animates to wrong input

**Cause:** Multiple elements match the auto-discovery heuristics

**Solution:** Add explicit `data-agentpulse-id` attributes or use CSS selector config

### No Element Found

**Symptom:** No animation, console shows "No element found"

**Cause:** No matching element in DOM

**Solutions:**
1. Check the normalized key matches your attribute
2. Verify element is rendered (not hidden/conditional)
3. Add `data-agentpulse-id` attribute
4. Use CSS selector config for complex cases

### Element Found But Not Visible

**Symptom:** Animation jumps to unexpected position

**Cause:** Element is outside viewport or has zero dimensions

**Solution:** The resolver auto-scrolls elements into view, but check CSS for `display: none` or `visibility: hidden`

### Third-Party Component Issues

**Symptom:** Animation targets container instead of input

**Cause:** Third-party components wrap inputs in multiple layers

**Solution:**
1. Pass data attribute via `inputProps` or similar
2. Use CSS selector targeting the actual `<input>` element

---

## Best Practices

1. **Prefer explicit data attributes** over auto-discovery for reliability
2. **Use consistent component IDs** that match your `useExpose` calls
3. **Test animations** in development before deploying
4. **Document custom selectors** in comments near your form code
5. **Use browser DevTools** to inspect element targeting when debugging
