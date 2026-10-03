# Mapping keys

A mapping redirects a sequence the user actually types to another internal sequence — vim's `:map`. It takes over the keys before ordinary bindings and composition keys.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Multi-key Sequences](/keyboard/boundSequence) | A mapping's `base` has multi-key and timeout behavior like a sequence |
| [Composition Engine](/keyboard/composition) | A mapping's `target` is a sequence of composition keys |

## addMapping(base, target, options?)

Registers a mapping.

- `base` {string[]} The external sequence — the keys the user actually presses.
- `target` {string[]} The target sequence; its keys must already be registered as composition keys or bindings.
- `options` {Object} Optional.
  - `timeout` {number} Max gap between presses in the sequence (ms). **Default:** the engine `defaultTimeout` (`400`).
  - `exclusive` {boolean} Whether a breaking key is swallowed silently (`true`) or cancels the mapping (`false`). **Default:** `false`.
  - `when` {Function | string} Condition, re-evaluated on every key; the mapping breaks when it is false.
  - `mode` {string} Restrict to a mode.
  - `category` {unknown[] | string} Whitelist of top screens; `"*"` means all.
  - `affectOverlay` {boolean} Trigger phase; `true` before the layer broadcast, otherwise after. **Default:** `false`.
- Returns: {boolean} `true` when registered; `false` (no throw) when `base` is empty, a target key is unregistered, or the same `base` already exists.

```tsx
const { addMapping } = useKeyboard()

useEffect(() => {
  addMapping(["g", "b"], ["t", "d"])   // pressing g b is pressing t d
  addMapping(["q"], ["t"])             // single-key mapping
}, [addMapping])
```

## removeMappingKey(keys)

Removes one mapping, matched exactly by sequence.

- `keys` {string[]} The `base` sequence to remove.
- Returns: {boolean} `true` when it existed and was removed.

## removeMapping(firstKey)

Removes every mapping starting with a given key.

- `firstKey` {string} The sequence's first key.
- Returns: {boolean} `true` when any were removed.

## subscribeMapping(fn)

Subscribes to mapping state changes.

- `fn` {Function} Called on state changes.
- Returns: {Function} An unsubscribe function.

## getLastMappingEvent()

- Returns: {MappingKeyEvent | null} The most recent mapping event, or `null`.

Event types: `started`, `continued`, `completed`, `broken`, `consumed`, `cancelled`.

```tsx
const { subscribeMapping, getLastMappingEvent } = useKeyboard()

useEffect(() => subscribeMapping(() => {
  if (getLastMappingEvent()?.type === "completed") flash()
}), [subscribeMapping, getLastMappingEvent])
```

## Boundaries

- When a single-key and a multi-key mapping share a first key, the **single-key one wins**, in registration order.
- A pending mapping and a pending composition are mutually exclusive; mapping keys take priority.
- A mapping started in one phase (`affectOverlay`) is not advanced by the other phase's processor.
- Removing / clearing mapping keys does **not** abort a pending mapping — call `abortComposition()` yourself if needed.
