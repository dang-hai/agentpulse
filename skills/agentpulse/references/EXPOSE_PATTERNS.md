# UI Component Exposure Patterns

This reference covers patterns for exposing common UI components to AI agents effectively.

## Principle 1: Expose Workflows as Humans Experience Them

AI agents should follow the same interaction paths as human users. If a human must:
1. Click a button to open a modal
2. Fill out the form inside
3. Click submit

Then the AI must do the same. **Never expose form fields without exposing the action to make them visible.**

### Visibility-First Pattern

```tsx
// ❌ Bad: Form fields exposed but modal might be closed
useExpose('user-form', { name, setName, email, setEmail, save });

// ✅ Good: Visibility control comes first
useExpose('user-form', {
  // Visibility state and controls (expose these first)
  isOpen,
  open,           // AI must call this before filling fields
  close,

  // Form fields (only usable after open())
  name, setName,
  email, setEmail,

  // Actions
  save,
  reset,
}, {
  description: 'User form in modal. Call open() first, fill fields, then save(). Call close() to dismiss.',
});
```

### Sequential Disclosure Pattern

For UIs with nested or progressive disclosure (accordions, tabs, wizards):

```tsx
useExpose('settings-panel', {
  // Section visibility
  sections: ['general', 'privacy', 'notifications'],
  expandedSection,
  expandSection,     // expandSection('privacy') to reveal privacy settings
  collapseSection,

  // General settings (visible when expandedSection === 'general')
  theme, setTheme,
  language, setLanguage,

  // Privacy settings (visible when expandedSection === 'privacy')
  shareAnalytics, setShareAnalytics,
  publicProfile, setPublicProfile,

  // Notification settings (visible when expandedSection === 'notifications')
  emailNotifs, setEmailNotifs,
  pushNotifs, setPushNotifs,
}, {
  description: 'Settings with collapsible sections. Call expandSection(name) to reveal a section before modifying its settings.',
});
```

### Project Board Workflow

```tsx
useExpose('project-board', {
  // Board state
  columns: ['backlog', 'in-progress', 'review', 'done'],
  tasks,

  // Task visibility (some boards have collapsed columns or hidden details)
  expandColumn,
  collapseColumn,
  openTaskDetail,    // Opens task detail panel/modal
  closeTaskDetail,

  // Task operations (some require task detail to be open)
  moveTask,          // moveTask(taskId, toColumn)
  updateTaskTitle,   // Might require openTaskDetail first
  addComment,        // Requires openTaskDetail first
  assignTask,

  // Creation workflow
  showNewTaskForm,
  hideNewTaskForm,
  createTask,
}, {
  description: 'Kanban board. moveTask(id, column) to move cards. For editing: openTaskDetail(id) first, then updateTaskTitle/addComment/assignTask, then closeTaskDetail().',
});
```

---

## Principle 2: Expose Intent, Not Implementation

Expose **what the user can do**, not internal state management details.

```tsx
// ❌ Bad: Exposes implementation details
useExpose('form', {
  internalState,
  dispatch,
  reducer,
});

// ✅ Good: Exposes user intent
useExpose('form', {
  email, setEmail,
  password, setPassword,
  submit,
  errors,
});
```

---

## Input Components

### Text Input

```tsx
function SearchInput() {
  const [value, setValue] = useState('');

  useExpose('search-input', {
    value,
    setValue,
    clear: () => setValue(''),
    isEmpty: value.length === 0,
  }, {
    description: 'Search input field. Use setValue(text) to type, clear() to reset. Check isEmpty.',
  });

  return <input value={value} onChange={e => setValue(e.target.value)} />;
}
```

### Textarea / Rich Text

```tsx
useExpose('message-composer', {
  content,
  setContent,

  // Useful metadata
  charCount: content.length,
  wordCount: content.split(/\s+/).filter(Boolean).length,
  isEmpty: content.trim().length === 0,

  // Actions
  clear: () => setContent(''),
  append: (text: string) => setContent(prev => prev + text),
  send: handleSend,
}, {
  description: 'Message composer. Use setContent(text) to write, or append(text) to add. Call send() when ready. Check charCount/wordCount.',
});
```

### Select / Dropdown

```tsx
useExpose('country-select', {
  selected,             // Current value
  options,              // Available options: { value, label }[]
  setSelected,          // Change selection

  // Helpers
  selectedLabel: options.find(o => o.value === selected)?.label,
  optionValues: options.map(o => o.value),
}, {
  description: 'Country selector. Read options for available choices. Use setSelected(value) to choose. Current: selected/selectedLabel.',
});
```

### Checkbox / Toggle

```tsx
useExpose('notifications-toggle', {
  enabled,
  toggle: () => setEnabled(!enabled),
  enable: () => setEnabled(true),
  disable: () => setEnabled(false),
}, {
  description: 'Notification toggle. Use toggle() to flip, or enable()/disable() for explicit control.',
});
```

---

## Form Patterns

### Simple Form

```tsx
useExpose('contact-form', {
  // Fields
  name, setName,
  email, setEmail,
  message, setMessage,

  // Status
  isValid: name && email && message,
  isSubmitting,
  error,
  success,

  // Actions
  submit: handleSubmit,
  reset: () => { setName(''); setEmail(''); setMessage(''); },
}, {
  description: 'Contact form. Fill name, email, message with setters. Check isValid, then submit(). Check success/error after.',
});
```

### Multi-Step Form / Wizard

```tsx
useExpose('checkout-wizard', {
  // Navigation state
  currentStep,          // 1, 2, or 3
  totalSteps: 3,
  stepNames: ['Shipping', 'Payment', 'Review'],
  currentStepName: stepNames[currentStep - 1],

  // Step data
  shippingData,
  paymentData,

  // Navigation
  nextStep: () => setStep(s => Math.min(s + 1, 3)),
  prevStep: () => setStep(s => Math.max(s - 1, 1)),
  goToStep: (n: number) => setStep(n),

  // Data entry
  setShippingField: (key, value) => setShippingData(d => ({ ...d, [key]: value })),
  setPaymentField: (key, value) => setPaymentData(d => ({ ...d, [key]: value })),

  // Completion
  canProceed: validateCurrentStep(),
  submit: handleCheckout,
}, {
  description: 'Checkout wizard (3 steps: Shipping, Payment, Review). Use nextStep()/prevStep() to navigate, or goToStep(n). Fill fields with setShippingField(key, value) or setPaymentField(key, value). Check canProceed before advancing. Call submit() on final step.',
});
```

### Form with Validation

```tsx
useExpose('signup-form', {
  // Fields
  email, setEmail,
  password, setPassword,

  // Validation state
  errors: {
    email: emailError,      // null or error message
    password: passwordError,
  },
  isValid: !emailError && !passwordError,

  // Password requirements
  passwordRequirements: {
    minLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%]/.test(password),
  },

  submit,
  reset,
}, {
  description: 'Signup form with validation. Set email/password with setters. Check errors object for field-specific issues. Check passwordRequirements for password rules. Only submit() when isValid is true.',
});
```

---

## List Patterns

### Simple List with CRUD

```tsx
useExpose('todo-list', {
  items,                    // Array of { id, text, completed }
  count: items.length,
  completedCount: items.filter(i => i.completed).length,

  // CRUD
  add: (text: string) => addItem(text),
  remove: (id: string) => removeItem(id),
  toggle: (id: string) => toggleItem(id),

  // Bulk operations
  clearCompleted: () => setItems(items.filter(i => !i.completed)),
  completeAll: () => setItems(items.map(i => ({ ...i, completed: true }))),
}, {
  description: 'Todo list. Read items array. Use add(text) to create, toggle(id) to check/uncheck, remove(id) to delete. Bulk: clearCompleted(), completeAll().',
});
```

### List with Selection

```tsx
useExpose('email-list', {
  emails,
  selectedIds,
  selectedCount: selectedIds.length,

  // Selection
  select: (id) => setSelectedIds([...selectedIds, id]),
  deselect: (id) => setSelectedIds(selectedIds.filter(x => x !== id)),
  toggleSelect: (id) => selectedIds.includes(id) ? deselect(id) : select(id),
  selectAll: () => setSelectedIds(emails.map(e => e.id)),
  deselectAll: () => setSelectedIds([]),

  // Actions on selection
  deleteSelected: () => deleteEmails(selectedIds),
  markSelectedRead: () => markRead(selectedIds),
  moveSelectedTo: (folder) => moveEmails(selectedIds, folder),
}, {
  description: 'Email list with selection. Use select(id)/deselect(id)/toggleSelect(id) to choose emails. selectAll()/deselectAll() for bulk. Actions: deleteSelected(), markSelectedRead(), moveSelectedTo(folder).',
});
```

### Filtered/Sorted List

```tsx
useExpose('product-list', {
  // Data
  products,               // Currently displayed (filtered/sorted)
  allProducts,            // Unfiltered
  totalCount: allProducts.length,
  displayedCount: products.length,

  // Filters
  filters: { category, priceRange, inStock },
  setFilter: (key, value) => updateFilter(key, value),
  clearFilters: () => resetFilters(),

  // Sorting
  sortBy,                 // 'price' | 'name' | 'rating'
  sortOrder,              // 'asc' | 'desc'
  setSortBy,
  toggleSortOrder: () => setSortOrder(o => o === 'asc' ? 'desc' : 'asc'),

  // Pagination
  page,
  totalPages,
  nextPage: () => setPage(p => Math.min(p + 1, totalPages)),
  prevPage: () => setPage(p => Math.max(p - 1, 1)),
  goToPage: (n) => setPage(n),
}, {
  description: 'Product list with filtering, sorting, pagination. Set filters with setFilter(key, value) or clearFilters(). Sort with setSortBy(field), toggleSortOrder(). Navigate with nextPage()/prevPage()/goToPage(n).',
});
```

---

## Navigation Patterns

### Tab Navigation

```tsx
useExpose('tabs', {
  activeTab,
  tabs: ['Overview', 'Details', 'Reviews'],
  activeIndex: tabs.indexOf(activeTab),

  setActiveTab,
  setActiveIndex: (i) => setActiveTab(tabs[i]),

  nextTab: () => setActiveTab(tabs[Math.min(activeIndex + 1, tabs.length - 1)]),
  prevTab: () => setActiveTab(tabs[Math.max(activeIndex - 1, 0)]),
}, {
  description: 'Tab navigation. Tabs: Overview, Details, Reviews. Use setActiveTab(name) or setActiveIndex(n). Navigate with nextTab()/prevTab().',
});
```

### Router / Page Navigation

```tsx
useExpose('router', {
  currentPath: location.pathname,
  currentPage: getPageName(location.pathname),

  navigateTo: (path) => navigate(path),
  goBack: () => navigate(-1),
  goForward: () => navigate(1),

  // Named routes
  goToHome: () => navigate('/'),
  goToSettings: () => navigate('/settings'),
  goToProfile: (userId) => navigate(`/users/${userId}`),
}, {
  description: 'Router. Current: currentPath/currentPage. Use navigateTo(path) or named helpers: goToHome(), goToSettings(), goToProfile(userId). goBack()/goForward() for history.',
});
```

---

## Modal / Dialog Patterns

```tsx
useExpose('confirm-dialog', {
  isOpen,
  title,
  message,

  open: (title, message) => { setTitle(title); setMessage(message); setIsOpen(true); },
  close: () => setIsOpen(false),
  confirm: () => { onConfirm(); close(); },
  cancel: () => { onCancel(); close(); },
}, {
  description: 'Confirmation dialog. Use open(title, message) to show. User responds via confirm() or cancel(). Check isOpen for state.',
});
```

---

## Async Data Patterns

### Data Fetching with Refresh

```tsx
useExpose('user-data', {
  user,
  loading,
  error,
  lastUpdated,

  refresh: () => fetchUser(),
  clear: () => { setUser(null); setError(null); },
}, {
  description: 'User data. Read user object. Check loading/error states. Call refresh() to reload. lastUpdated shows freshness.',
});
```

### Infinite Scroll / Load More

```tsx
useExpose('feed', {
  items,
  hasMore,
  loading,

  loadMore: () => fetchNextPage(),
  refresh: () => { setItems([]); fetchFirstPage(); },
}, {
  description: 'Scrollable feed. Read items array. Call loadMore() if hasMore is true. Check loading state. Use refresh() to reload from start.',
});
```

---

## State Management Integration

### Redux/Zustand Store Connector

```tsx
function StoreConnector() {
  const store = useStore();

  useExpose('app-state', {
    // Expose derived/computed state, not raw store
    isLoggedIn: !!store.user,
    username: store.user?.name,
    cartItemCount: store.cart.length,
    cartTotal: store.cart.reduce((sum, i) => sum + i.price, 0),

    // Expose actions, not dispatch
    login: store.login,
    logout: store.logout,
    addToCart: store.addToCart,
    checkout: store.checkout,
  }, {
    description: 'App state. Check isLoggedIn before user operations. Cart: cartItemCount, cartTotal, addToCart(productId), checkout().',
  });

  return null;
}
```

---

## Scrollable Containers

Use `createScrollBindings` to add scroll control to any scrollable element:

```tsx
import { useExpose, createScrollBindings } from 'agentpulse';

function ChatMessages({ messages }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useExpose('chat-messages', {
    messages,
    unreadCount: messages.filter(m => !m.read).length,
    ...createScrollBindings(containerRef),
  }, {
    description: 'Chat messages. Read messages array. scrollToBottom() to see latest. scrollToTop() for history.',
  });

  return (
    <div ref={containerRef} style={{ height: 400, overflow: 'auto' }}>
      {messages.map(m => <Message key={m.id} message={m} />)}
    </div>
  );
}
```

### Scroll Bindings API

| Binding | Type | Description |
|---------|------|-------------|
| `scrollTop` | Accessor | Current scroll position (read/write) |
| `scrollHeight` | Accessor | Total scrollable height (read-only) |
| `clientHeight` | Accessor | Visible container height (read-only) |
| `scrollToTop()` | Action | Scroll to top |
| `scrollToBottom()` | Action | Scroll to bottom |
| `scrollTo(pos)` | Action | Scroll to specific pixel position |
| `scrollBy(delta)` | Action | Scroll by relative amount (+/- pixels) |

### Options

```tsx
// Smooth scrolling (default)
createScrollBindings(ref, { behavior: 'smooth' });

// Instant scrolling
createScrollBindings(ref, { behavior: 'auto' });
```

---

## Multiple Component Instances

When exposing components that render multiple times (list items, tabs, etc.):

### Option 1: useExposeId Hook

```tsx
import { useExpose, useExposeId } from 'agentpulse';

function FileItem({ file, onDelete }) {
  const exposeId = useExposeId('file-item');

  useExpose(exposeId, {
    name: file.name,
    size: file.size,
    delete: () => onDelete(file.id),
  }, {
    description: `File: ${file.name}. Call delete() to remove.`,
  });

  return <div>{file.name}</div>;
}
```

Generates: `file-item:r1a2b3` (React-generated unique suffix)

### Option 2: Item ID in Expose ID

```tsx
function FileItem({ file, onDelete }) {
  useExpose(`file-item:${file.id}`, {
    name: file.name,
    delete: () => onDelete(file.id),
  });

  return <div>{file.name}</div>;
}
```

Generates: `file-item:abc123` (your item's actual ID)

### Option 3: Parent Exposes Collection

```tsx
function FileList({ files, onDelete }) {
  useExpose('file-list', {
    files,
    count: files.length,
    deleteFile: (id: string) => onDelete(id),
    getFile: (id: string) => files.find(f => f.id === id),
  }, {
    description: 'File list. Read files array. Use deleteFile(id) to remove. getFile(id) returns single file.',
  });

  return <ul>{files.map(f => <li key={f.id}>{f.name}</li>)}</ul>;
}
```

**Recommendation:** Option 3 (parent collection) is usually simpler for AI agents. Use individual item exposure only when items have complex independent state.

---

## Non-React Exposure

For exposing state outside React components:

### Services / Singletons

```tsx
import { expose } from 'agentpulse';

class AuthService {
  private user: User | null = null;
  private unregister: (() => void) | null = null;

  init() {
    this.unregister = expose('auth', {
      isLoggedIn: { get: () => !!this.user, set: () => {} },
      username: { get: () => this.user?.name, set: () => {} },
      logout: () => this.logout(),
    }, {
      description: 'Auth state. Check isLoggedIn, read username. Call logout() to sign out.',
    });
  }

  destroy() {
    this.unregister?.();
  }
}
```

### Module-level State

```tsx
import { expose } from 'agentpulse';

let theme: 'light' | 'dark' = 'light';

const unregister = expose('theme', {
  current: { get: () => theme, set: () => {} },
  toggle: () => { theme = theme === 'light' ? 'dark' : 'light'; },
  setTheme: (t: 'light' | 'dark') => { theme = t; },
}, {
  description: 'App theme. Read current, use setTheme(value) or toggle().',
});

// Cleanup on app shutdown
// unregister();
```

---

## Testing Exposed Components

```tsx
import { getRegistry, resetRegistry } from 'agentpulse';

describe('SearchBox exposure', () => {
  beforeEach(() => resetRegistry());

  it('exposes expected bindings', () => {
    render(<SearchBox />);

    const bindings = getRegistry().get('search');

    // Check shape
    expect(bindings).toHaveProperty('query');
    expect(bindings).toHaveProperty('setQuery');
    expect(bindings).toHaveProperty('search');

    // Check types
    expect(typeof bindings.search).toBe('function');
  });

  it('setQuery updates query value', () => {
    render(<SearchBox />);

    const bindings = getRegistry().get('search');
    bindings.setQuery('test');

    expect(bindings.query).toBe('test');
  });
});
```
