# Multi-key sequences

`boundSequence` requires several keys pressed in order within a timeout, like vim's `d d`. The first key does not fire immediately; the engine enters a pending state and waits for the rest. A timeout or a mismatched key cancels the sequence.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | A sequence is a binding |
| [Binding attribution](/screen/binding-attribution) | Sequences attribute exactly like `boundKeyboard` |

## Signature

```ts
boundSequence(keys: string[], handler: KeyHandler, options?: SequenceOptions): () => void
boundSequence(sequenceActionId: string, options?: SequenceOptions): () => void
boundSequence(keys: string[], sequenceActionId: string, options?: SequenceOptions): () => void
```

- `keys` {string[]} The ordered keys; at least two. Required in the explicit-keys forms; not used by the preset-keys form.
- `handler` {() => void} Runs when the full sequence matches.
- `sequenceActionId` {string} A registered `SequenceOperationEntry` ID; its `action` is the handler and its `keys` / `timeout` act as defaults. See [Shortcuts & Actions](/keyboard/shortcuts-actions#sequence-actions).
- `options` {SequenceOptions} Adds `timeout` and `exclusive` to `BoundKeyboardOptions`.
- Returns: an unbind function.

```tsx
const { boundSequence } = useKeyboard()

useEffect(
  () => boundSequence(['d', 'd'], () => deleteItem()),
  [boundSequence],
)

// With a registered sequence action
boundSequence('goto-top')
boundSequence(['ctrl+g', 'g'], 'goto-top', { timeout: 800 })
```

`boundSequence(['a'], ...)` throws `requires at least 2 keys in the sequence`. An unknown `sequenceActionId` throws `Action "<id>" is not registered.`

## Options

| Option | Type | Effect | Default |
|---|---|---|---|
| `timeout` | `number` | Maximum gap between presses (ms) | `500` |
| `exclusive` | `boolean` | Swallow a mismatched key and keep waiting; `false` cancels and releases it | `false` |
| `when` | `() => boolean \| string` | Condition | — |
| `mode` | `string` | Restrict to a mode | — |
| `focusId` | `string \| FocusRef` | Scope to a focus target | — |
| `elementId` | `string` | Scope to a layer element | injected |
| `stopsWorkingAfterLayerAppearing` | `boolean` | Dormant while a layer is open | `false` |

```tsx
boundSequence(['g', 'g'], () => jumpToTop(), { timeout: 700 })
boundSequence(['w', 'w'], () => lock(), { exclusive: true })
```

`times`, `once`, and `observer` exist on the `SequenceOptions` type but the sequence matcher does not use them; they apply to `boundKeyboard` only.

## Pending state

```ts
currentScreenHasSequenceWaiting(sync?)
thereGlobalQueueWaiting(sync?)
```

- `currentScreenHasSequenceWaiting` reads the caller's own scope: a page component sees the page's sequence, a layer or modal element sees that layer's sequence.
- `thereGlobalQueueWaiting` does the same for `globalSequence`.
- Both accept an optional `sync` callback, invoked after every key press so a status line can re-render.

```tsx
const { currentScreenHasSequenceWaiting } = useKeyboard()
const [, setTick] = useState(0)
const sync = useCallback(() => setTick((n) => n + 1), [])

const waiting = currentScreenHasSequenceWaiting(sync)
```

Neither function consumes keys; they only report state.

## Boundaries

- Every matched key resets `timeout`.
- With `exclusive: false`, a mismatched key cancels the sequence and continues to its own bindings; with `true`, it is swallowed.
- Sequences share attribution and focus rules with `boundKeyboard`.
- Return the unbind function before unmount so no pending sequence is left behind.
