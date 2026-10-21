# Composition engine

The composition engine links several keys into a **chain**. Each key reads and rewrites a `CompositionContext` and passes the next state through `lastFlag`; a chain can carry arbitrary values and register undo actions. It suits input such as `3 d` (count + action) or `d w` (operator + target).

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Multi-key Sequences](/keyboard/boundSequence) | Sequences match keys; composition also carries state |
| [Intermediate Binding](/keyboard/boundKeyboard-advanced) | `when` and named conditions apply to composition entries |

## Model

```ts
type CompositionContext<T = unknown> = {
  value: T
  lastFlag: string | null
  steps: string[]
}
```

- `value` is any data carried through the chain.
- `lastFlag` is the flag left by the previous key; `null` at the head.
- `steps` lists executed keys for undo and debugging.

A `CompositionKey`:

| Field | Type | Effect |
|---|---|---|
| `key` | `string` | Trigger key |
| `flags` | `{ need, become }[]` | Transition table: when the previous flag is `need`, this key sets `become` |
| `needs` | `string[]` | Which previous flags this key accepts |
| `alternativeFlag` | `string` | Flag used at the head or when no transition matches |
| `optional` | `boolean` | The key may start a chain with nothing pending |
| `timeout` | `number` | Next-key timeout; defaults to the engine `defaultTimeout` (400ms) |
| `exclusive` | `boolean` | Swallow a mismatched key and keep waiting instead of cancelling |
| `execute` | `(ctx) => ctx \| null` | Rewrites the context; `null` terminates the chain |
| `undoAction` | `(ctx) => ctx \| null` | Inverse operation; `null` stops the undo walk |
| `isEndKey` | `string[]` | End the chain when the current `lastFlag` is listed |
| `KeyReleaseWhenChainInterrupted` | `boolean` | Swallow the breaking key when `execute` returns `null` or validation fails |
| `when` / `mode` / `category` / `affectOverlay` / `executeWhenNoOverlay` | — | Same as other bindings |

### How the flag is chosen

- Head (`lastFlag === null`): use `alternativeFlag`.
- Continuation: if `lastFlag` matches a `need` in `flags`, use its `become`; otherwise use `alternativeFlag`.
- If `execute` sets `lastFlag` explicitly, the engine does not override it.

### How a key is selected

Several entries may share a trigger key. Selection order:

1. Entries whose `needs` match the current `lastFlag`; at the head, entries with `optional: true` or `needs: []`.
2. More modifier segments win (`ctrl+s` over `s`).
3. Longer `needs` lists win (stricter contract).

## Registration

```ts
registryCompositionKey(entry: CompositionKey): void
```

```tsx
const { registryCompositionKey } = useKeyboard()

useEffect(() => {
  registryCompositionKey({
    key: '3',
    flags: [],
    needs: [],
    optional: true,
    alternativeFlag: 'times',
    execute: (ctx) => ({ ...ctx, value: 3, lastFlag: 'times', steps: [...ctx.steps, '3'] }),
  })

  registryCompositionKey({
    key: 'd',
    flags: [],
    needs: ['times'],
    alternativeFlag: 'action',
    execute: (ctx) => {
      if (typeof ctx.value !== 'number') return null
      deleteLines(ctx.value)
      return null
    },
  })
}, [registryCompositionKey])
```

`removeCompositionKey(key)` removes every entry for that trigger key and returns whether any existed; it does not abort a pending chain. `clearAllCompositionKeys()` clears the table.

`updateCompositionKey(key, flags, updates)` locates an entry by `key + flags` and merges fields, returning whether it found one. Several entries can share a key and be distinguished by `flags`:

```ts
updateCompositionKey('d', [{ need: 'times', become: 'action' }], { timeout: 800 })
```

### A full chain: count, execute, undo

```ts
registryCompositionKey({
  key: '3',
  flags: [],
  needs: [],
  optional: true,
  alternativeFlag: 'count',
  execute: (ctx) => ({
    ...ctx,
    value: 3,
    steps: [...ctx.steps, '3'],
  }),
})

registryCompositionKey({
  key: 'd',
  flags: [{ need: 'count', become: 'deleted' }],
  needs: ['count'],
  alternativeFlag: 'deleted',
  execute: (ctx) => {
    if (typeof ctx.value !== 'number') return null
    return {
      ...ctx,
      value: deleteLines(ctx.value),
      steps: [...ctx.steps, 'd'],
    }
  },
  undoAction: (ctx) => ({
    ...ctx,
    value: restoreLines(ctx.value),
    steps: [],
  }),
})
```

Pressing `3` starts the chain and sets `lastFlag` to `count`; pressing `d` within the timeout advances it to `deleted` via `flags`. The timeout records the chain, and `undoComposition()` runs `d`'s `undoAction` in reverse, then the default no-op for `3`. A mismatched key before `d` drops the chain without recording it; add `exclusive: true` to keep waiting instead.

## How a chain ends

| Outcome | Trigger | Undo buffer | Event |
|---|---|---|---|
| Recorded | Timeout, `isEndKey`, `execute` returns `null`, `abortComposition()` | Yes | `completed`; explicit abort is `aborted` |
| Dropped | A key matches no entry, or a value guard rejects it | No | `broken` |

- With `exclusive: true`, a mismatched key is swallowed and the chain keeps waiting; the eventual timeout records it.
- When `isEndKey` matches, `execute` still runs (side effects are kept), but its returned context is discarded and the key itself is not recorded—only the keys before it are.
- `execute` returning `null` terminates deliberately; the terminating key is likewise not recorded. The breaking key continues to lower stages by default; `KeyReleaseWhenChainInterrupted: true` swallows it.
- A value-guard failure (input or output) clears the pending chain and warns outside production.

## Value validation

```ts
setValueSchema(schema: ValueSchema)
```

`ValueSchema` is `Record<flagName, (value) => boolean>`. The engine validates the input value under the current `lastFlag` before `execute`, and the output value under the new flag after it; flags without a guard pass.

```ts
setValueSchema({
  times: (v): v is number => typeof v === 'number',
  action: (v) => typeof v === 'number',
})
```

## Undo

```ts
undoComposition(steps = 1, options?: { isolated?: boolean; byKey?: boolean })
```

- `steps` counts chains by default; `byKey: true` counts individual keys.
- `isolated: false` (default) passes the context across chains; `true` starts each chain from its own saved `ctx`.
- Returns the context after undo, or `null` when nothing is buffered.
- Requesting more than buffered throws: `Cannot undo N sequence(s): only M buffered.` (`key(s)` with `byKey`).
- When an `undoAction` returns `null`, the walk stops; that entry and everything older stay buffered.

```ts
const { undoComposition, bufferedCompositionCount, clearCompositionBuffers } = useKeyboard()

undoComposition()
undoComposition(2, { byKey: true })
bufferedCompositionCount()
clearCompositionBuffers()
```

## Events

```ts
subscribeComposition(fn: () => void): () => void
getLastCompositionEvent(): CompositionEvent | null
```

| Event | When |
|---|---|
| `started` | A head key executed |
| `continued` | A continuation key executed |
| `completed` | The chain completed and was recorded |
| `aborted` | `abortComposition()` |
| `broken` | A key matched nothing; the chain was dropped |
| `consumed` | An `exclusive` chain swallowed a mismatched key |
| `undone` | `undoComposition()` finished; `steps` is the actual count |
| `cleared` | `clearCompositionBuffers()` |

`getCompositionContext()` returns a shallow copy of the current context; `hasPendingComposition()` reports whether a chain is pending.

## Interaction with mappings

Mappings run before composition. `addMapping(base, target)` redirects an external sequence `base` to a chain of registered composition keys `target`; the target chain goes through the same validation, termination, and undo logic as typed input. Pending mapping and composition states are mutually exclusive, and mappings win. See [Mapping keys](/keyboard/mapping-keys).

## Boundaries

- Composition entries share `when` / `mode` / `category` / `affectOverlay` with other bindings; `affectOverlay: true` runs before the layer broadcast.
- A key without a pending chain and without `optional` cannot start one.
- A screen switch does not clear the undo buffer; call `clearCompositionBuffers()` when needed.
- `abortComposition()` also cancels a pending mapping sequence.
- One key can have several entries; `removeCompositionKey` removes all of them.
