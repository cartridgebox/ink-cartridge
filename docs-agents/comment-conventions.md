# Comment conventions

## 1. No decorative comments or separators

Comments must explain **why**, not restate what the code does.

**Correct** (explains why):
```ts
// We use a ref here because the callback must be stable across re-renders,
// but the actual value may change. Storing it in a ref prevents unnecessary
// re-binding of the keyboard handler.
const onCancelRef = useRef(onCancel);
```

**Wrong** (decorative separator):
```ts
// ─────────────────────────────────────────────
// Component rendering
// ─────────────────────────────────────────────
```

**Wrong** (states "what"):
```ts
// Set the value to 42
setValue(42);
```

## 2. Explain "why", not "what"

**Correct** (explains design decision):
```ts
// We cannot use the regular `focusSet` here because the overlay may not
// be mounted yet. Instead, we defer focus via a ref.
deferredFocusRef.current = focusId;
```

**Wrong** (repeats code):
```ts
// Increment the counter
counter++;
```

## 3. Internal implementation must have clear comments

For complex logic, non-obvious edge cases, performance optimizations, or concurrency controls, always add comments explaining the underlying principles.

**Correct**:
```ts
// The write queue is a promise chain. We use `.then(task, task)` so that
// even if a previous write rejects, the next write still executes.
// Without the second argument, a rejection would break the chain forever.
this.pending = this.pending.then(task, task);
```

## 4. Public API must have English JSDoc

Every public function, component, type, or constant exported from `src/index.ts` must have an English JSDoc comment. These comments feed the [typedoc-generated API docs](https://cartridgebox.art/) (auto-published to GitHub Pages). Run `npm run docs` after any public API change. Keep JSDoc free of project-internal chatter that would pollute the generated pages.

**Correct** (complete JSDoc):
```ts
/**
 * Register a component as a screen in the navigation tree.
 *
 * @param component - The React component (used as the unique token).
 * @param template  - Default props for the component.
 * @param options   - Optional registration options (e.g. `parent`).
 * @throws {Error} If the component has already been registered.
 * @example
 * ```tsx
 * registerComponent(Menu, {});
 * registerComponent(Game, { level: 1 }, { parent: Menu });
 * ```
 */
export function registerComponent(...): void;
```

**Wrong** (missing or one-line):
```ts
// Register a component
export function registerComponent(...) { ... }
```
