# Composition engine

The composition engine organizes several keys into a "chain": one key produces a value and sets a `flag`, the next key continues from that `flag`, until the chain ends. It suits compound input that carries intermediate state, such as `3 d` (count + action) or `d w` (operation + target). The undo history (`undoComposition`) is built on the same `flag` mechanism.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Multi-key Sequences](/keyboard/boundSequence) | Advancing a chain resembles "pending" sequences, but it carries state |
| [Intermediate Binding](/keyboard/boundKeyboard-advanced) | The `when` named condition works on composition entries too |

## CompositionKey

A `CompositionKey` describes what one key does.

- `key` {string} The trigger key name.
- `flags` {FlagTransition[]} The state transition table, each element `{ need, become }`: when the current flag is `need`, it becomes `become` after execution.
- `needs` {string[]} The preceding flags this key expects; it responds only after one of them.
- `alternativeFlag` {string} The fallback flag when there is no predecessor / no match.
- `optional` {boolean} When `true`, the key can start a chain with no pending chain.
- `execute` {Function} The handler `(ctx) => ctx | null`; returning `null` ends the chain.
- `isEndKey` {string[]} When the current flag is listed here, the chain is treated as ended.
- `timeout` {number} Next-key timeout (ms). **Default:** the engine `defaultTimeout` (`400`).
- `exclusive` {boolean} Whether a breaking key is swallowed silently or cancels the chain.
- `undoAction` {Function} The inverse for undo, `(ctx) => ctx | null`; returning `null` stops the walk.
- `when` / `mode` / `category` / `affectOverlay` / `executeWhenNoOverlay` behave as in other bindings.

State travels through the chain as a `CompositionContext`: `{ value, lastFlag, steps }`.

## registryCompositionKey(entry)

Registers a composition key.

- `entry` {CompositionKey} The composition key definition, as above.
- Returns: nothing.

```tsx
const { registryCompositionKey } = useKeyboard()

useEffect(() => {
  // Head: a digit writes the value and sets flag "times"
  registryCompositionKey({
    key: "3", flags: [], needs: [], optional: true, alternativeFlag: "times",
    execute: (ctx) => ({ ...ctx, value: 3, lastFlag: "times", steps: [...ctx.steps, "3"] }),
  })
  // Continuation: d responds after flag "times", reads the count, ends the chain
  registryCompositionKey({
    key: "d", flags: [], needs: ["times"], alternativeFlag: "action",
    execute: (ctx) => { deleteLines(ctx.value as number); return null },
  })
}, [])
```

## removeCompositionKey(key)

- `key` {string} The trigger key to remove.
- Returns: {boolean} `true` when it existed and was removed.
- Note: does not abort a pending chain.

## clearAllCompositionKeys()

Clears every composition entry. Does not abort a pending chain.

- Returns: nothing.

## abortComposition()

Immediately cancels the pending chain.

- Returns: nothing.

## hasPendingComposition()

- Returns: {boolean} Whether a chain is currently pending.

## getCompositionContext()

- Returns: {CompositionContext} A shallow copy of the current chain context.

## setValueSchema(schema)

Sets value-type validation for the chain.

- `schema` {ValueSchema} A `Record<flagName, (value) => boolean>`. The engine validates the input value before `execute` and the output value after; a flag with no guard passes.
- Returns: nothing.

A failed check clears the pending chain and `console.warn`s only outside production.

## undoComposition(steps?, options?)

Steps backward through completed chains, running each `undoAction`.

- `steps` {number} How many chains to undo. **Default:** `1`.
- `options` {Object} Optional.
  - `isolated` {boolean} `true` starts each chain from its own saved `ctx`. **Default:** `false`.
  - `byKey` {boolean} Counts `steps` in **keys** rather than chains. **Default:** `false`.
- Returns: {CompositionContext | null} The context after undo; `null` when nothing is buffered.

Requesting more steps than buffered throws (`Cannot undo N sequence(s): only M buffered.`); when a chain's `undoAction` returns `null` the walk stops and later entries stay buffered.

## bufferedCompositionCount()

- Returns: {number} How many chains are currently undoable.

## clearCompositionBuffers()

Clears the undo history.

- Returns: nothing.

## subscribeComposition(fn)

- `fn` {Function} Called on state changes.
- Returns: {Function} An unsubscribe function.

## getLastCompositionEvent()

- Returns: {CompositionEvent | null} The most recent event.

Event types: `started`, `continued`, `completed`, `aborted`, `broken`, `consumed`, `undone`, `cleared`.
