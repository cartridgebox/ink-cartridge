# Global key bindings: `globalKeys` and `globalSequence`

`globalKeys` registers keys that fire **independently of the screen stack and layers**: as long as the top screen is listed in the entry's `category`, the key fires — for keys the whole app should answer to, such as a global quit or a theme toggle. `globalSequence` is the multi-key counterpart.

```typescript
globalKeys(entries: GlobalKeyEntry[], options?: { mode?: "replace" | "add" }): void
globalSequence(entries: GlobalSequenceEntry[], options?: { mode?: "replace" | "add" }): void
```

Call them from `useKeyboard()`. Neither returns an unbind function — a call replaces the whole set or appends to it, see “Registration: replace vs add” below.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Global keys share the same key-name format and `operate` semantics |
| [Multi-key Sequences](/keyboard/boundSequence) | `globalSequence` is the global form of a sequence; `timeout` / `exclusive` behave the same |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | `affectLayer` decides which phase of layer propagation the global key lands in |

## How they differ from `boundKeyboard`

| | `boundKeyboard` | `globalKeys` |
|---|---|---|
| Ownership | Attached to the current screen / layer / element | One global set, independent of ownership |
| Scope | While the owning screen (or element) is active | While the top screen is inside `category` |
| Registration | Each call adds an entry, returns an unbind function | Replaces or appends, returns nothing |
| Key-name format | Normalized (`"s"`, `"ctrl+q"`, `"return"`) | Same |

## Where it sits in the pipeline

`affectLayer` places it in one of the two phases of the 9-stage pipeline:

| `affectLayer` | Fires | Overridable by | With no layer open |
|---|---|---|---|
| `false` (default) | **After** the layer broadcast, before the screen stack | Screen bindings (`boundKeyboard`) | Fires normally |
| `true` | **Before** the layer broadcast | Layer-element bindings | Skipped, unless `executeWhenNoOverlay: true` |

An `affectLayer: true` global key is an "overlay-phase" binding: it grabs the key before any layer does, so it suits shortcuts that must still work when a layer covers the screen.

## `GlobalKeyEntry` options

- `key` {string | string[]} Normalized key name(s).
- `operate` {() => void | string} Callback; or a registered shortcut **action id**, whose callback is used.
- `category` {unknown[] | "*"} Whitelist of screens that may trigger it, see below.
- `cover` {boolean} Whether a screen may override this key. **Default:** `true`.
- `affectLayer` {boolean} Trigger phase, see the table above. **Default:** `false`.
- `times` {number} Press count required before firing (≥ 1). **Default:** fires on every press.
- `observer` {(remaining: number) => void} Called on each press while counting, receives how many presses remain; requires `times`.
- `when` {(() => boolean) | string} Condition (callback or registered named condition id); entry is skipped when false.
- `mode` {string} Only active in the given mode (the mode must be registered).
- `executeWhenNoOverlay` {boolean} Only meaningful with `affectLayer: true`: fire even with no layer open.

### `category`

`category` filters by the **top screen**: `"*"` or omitted means all screens; `[]` means no screen (effectively disabled); `[Menu, Game]` fires only when the stack top is exactly `Menu` or `Game`.

```tsx
// Global quit: works on every screen
globalKeys([{ key: "q", operate: () => process.exit(0) }])

// Only on the game and menu screens
globalKeys([{ key: "p", operate: pause, category: [Game, Menu] }])
```

### `cover`

`cover` controls whether a screen may claim the same key via `boundKeyboard`:

- `cover: true` (default): if a screen binds the same key, the global key is **skipped** on that screen — the local binding wins.
- `cover: false`: the global key **cannot be overridden**. If a screen (or element) in the whitelist tries to bind the same key, registration throws `... declared in globalKeys with cover: false, so overriding is not allowed.`

```tsx
// Force-quit globally; no screen may rebind q
globalKeys([{ key: "q", operate: () => process.exit(0), cover: false }])
```

### `times` and `observer`

`times` makes the global key require several presses to fire; the counter accumulates per entry, never auto-resets, and returns to 0 after firing. `observer` runs on every press with the number of presses **still remaining**:

```tsx
// Quit only after three ctrl+x presses, showing the remaining count
globalKeys([
  {
    key: "ctrl+x",
    times: 3,
    operate: () => process.exit(0),
    observer: (remaining) => setHint(`${remaining} more to quit`),
  },
])
```

### `when` and `mode`

As with other bindings: a false `when` skips the whole entry; `mode` restricts it to the matching mode.

```tsx
globalKeys([{ key: "s", operate: save, when: () => isDirty, mode: "normal" }])
```

## `globalSequence`

A global sequence matches multi-key combinations. It differs from `globalKeys` in that it supports **no `times` / `observer`**, and its `cover` is only overridable by `boundSequence` (plain `boundKeyboard` bindings do not participate in that check).

- `keys` {string[]} Sequence key names, **at least two**, else it throws.
- `operate` {() => void | string} Callback; or a registered **sequence action id**.
- `timeout` {number} Max gap between presses (ms). **Default:** `500`.
- `exclusive` {boolean} On a mismatched key: `false` cancels the sequence and falls through; `true` swallows it silently. **Default:** `false`.
- `cover` {boolean} Whether `boundSequence` may override it. **Default:** `true`.
- `affectLayer` {boolean} Trigger phase, same semantics as global keys. **Default:** `false`.
- `category` {unknown[] | "*"} Screen whitelist, same semantics as global keys.
- `when` {(() => boolean) | string} Condition.
- `mode` {string} Restrict to a mode.
- `executeWhenNoOverlay` {boolean} Only meaningful with `affectLayer: true`.

```tsx
// Scroll to top with g g on any screen
globalSequence([{ keys: ["g", "g"], operate: scrollToTop }])

// Overlay phase: also fires while a layer is open; within 700ms
globalSequence([
  { keys: ["ctrl+t", "t"], operate: toggleTheme, affectLayer: true, executeWhenNoOverlay: true, timeout: 700 },
])
```

## Registration: replace vs add

Both functions **replace** the previous global keys / sequences by default; passing `{ mode: "add" }` appends to the existing list. A replacing call also clears any in-flight pending sequence.

```tsx
useEffect(() => {
  globalKeys([{ key: "q", operate: quit }])                 // replace: only q remains
  return () => globalKeys([], { mode: "replace" })          // clear on unmount
}, [])

// Append: keep q, add one more
globalKeys([{ key: "r", operate: reload }], { mode: "add" })
```

## Reading the current registrations

```tsx
const { getGlobalKeys, getGlobalSequences, getGlobalPendingSequence } = useKeyboard()

getGlobalKeys()             // resolved global key entries
getGlobalSequences()        // resolved global sequence entries
getGlobalPendingSequence()  // the global sequence awaiting more keys, or null
```
