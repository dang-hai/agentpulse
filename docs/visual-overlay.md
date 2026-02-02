# Visual Overlay Quickstart

Show users what the AI is doing with animated cursor, typing, and click effects.

## Basic Setup

Add `VisualOverlay` inside your `AgentPulseProvider`:

```tsx
import { AgentPulseProvider, VisualOverlay } from 'agentpulse';

function App() {
  return (
    <AgentPulseProvider endpoint="ws://localhost:3100/ws">
      <VisualOverlay />
      <MyApp />
    </AgentPulseProvider>
  );
}
```

That's it. When an AI agent calls `expose_set` or `expose_call`, users will see:
- An animated cursor moving to the target element
- Character-by-character typing for text inputs
- Click ripple effects for button actions

## Configuration

Toggle individual features:

```tsx
<VisualOverlay
  enabled={true}           // Master toggle (default: true)
  cursor={true}            // Show AI cursor (default: true)
  clickRipple={true}       // Show click effects (default: true)
  typingAnimation={true}   // Character-by-character typing (default: true)
  typingSpeed={12}         // Characters per second (default: 12)
/>
```

## How Elements Are Found

The overlay automatically finds target elements using this fallback chain:

1. `data-agentpulse-id` attribute matching the component ID
2. Form containers with matching input names
3. `<input>` or `<textarea>` by `name` attribute
4. Elements by `id` attribute
5. Input by `placeholder` text
6. Elements by `aria-label`
7. Submit buttons for form actions
8. Open/close buttons for modal actions

### Adding Target Hints

For reliable targeting, add `data-agentpulse-id` to your elements:

```tsx
function SearchBox() {
  const [query, setQuery] = useState('');

  useExpose('search', { query, setQuery, search: () => console.log('searching...') });

  return (
    <div>
      <input
        data-agentpulse-id="search-query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      <button data-agentpulse-id="search-search">Go</button>
    </div>
  );
}
```

Format: `data-agentpulse-id="componentId-normalizedKey"`

Where `normalizedKey` is the binding key with `set` prefix removed and lowercased (e.g., `setQuery` → `query`).

## Custom Target Selectors

For complex UIs, provide explicit CSS selectors:

```tsx
<VisualOverlay
  targets={{
    'contact-form': {
      name: 'input[name="fullName"]',
      email: 'input[type="email"]',
      submit: 'button[type="submit"]',
    },
    'sidebar': {
      toggle: '#sidebar-toggle',
    },
  }}
/>
```

Or configure programmatically:

```tsx
import { setAnimationConfig, clearAnimationConfig } from 'agentpulse';

// Set custom selectors
setAnimationConfig({
  'my-form': {
    username: '#username-input',
    password: '#password-input',
  },
});

// Clear when done
clearAnimationConfig('my-form');
```

## Typing Animation

The typing animation mimics human behavior:
- Varies speed based on character patterns
- Types common letter pairs (`th`, `he`, `in`) faster
- Pauses after punctuation and spaces
- Adds occasional micro-hesitations
- Slows down for capital letters

Adjust speed with `typingSpeed` (characters per second, default 12).

## Styling

The overlay uses these default styles:
- Cursor: Indigo (#4F46E5) with "AI" label badge
- Click ripple: 3px indigo border, expanding animation
- Typing indicator: Fixed bottom-right with gradient background

The overlay renders at `z-index: 99999` with `pointer-events: none` so it doesn't interfere with user interactions.

## Disabling for Specific Interactions

The overlay responds to all `expose_set` and `expose_call` operations. To hide animations for background operations, disable the overlay temporarily:

```tsx
const [showOverlay, setShowOverlay] = useState(true);

<VisualOverlay enabled={showOverlay} />
```

Or configure specific features:

```tsx
// Show cursor but skip typing animation for faster operations
<VisualOverlay typingAnimation={false} />
```
