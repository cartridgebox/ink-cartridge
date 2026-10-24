# Passing keys with allowModal

`allowModal` declares exceptions to a modal's keyboard barrier: a listed key that the modal does not handle may cross the barrier and reach lower regular layers or the screen.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | The barrier this option opens |

## Signature

```ts
allowModal(keys: string[], options?: AllowModalOptions): () => void
```

- `keys` {string[]} Key names to allow through.
- `options` {AllowModalOptions}
  - `[elementId]` {string} The owning element; injected automatically inside a modal element.
  - `[focusId]` {string | FocusRef} Scope the rule to a focus target. A string targets the default group; `{ group, focusId }` targets a named group.
  - `[when]` {(() => boolean) | string} Condition callback or registered condition ID; the rule is inert while it is `false`.
- Returns: an unbind function.

```tsx
const { allowModal } = useKeyboard()

useEffect(() => allowModal(['tab']), [allowModal])
```

## Semantics

A key crosses the barrier only when both hold:

1. The modal layer does not handle it.
2. It is on the allowlist and its `when` condition is true.

The modal's own bindings always win. A key handled inside the modal does not pass through, even when listed.

Each allow list is evaluated on its own scope. A when-disabled rule blocks only its own focus target's — or the layer's — allow for that key; it does not veto another active target's allow rule for the same key.

## Boundaries

- Works only inside a modal-layer component. Calling it on a page or regular layer is a no-op with a development warning.
- Allowing a key does not skip the modal: the key still goes through the modal broadcast first.
- Rules end when the returned unbind function runs; return it from `useEffect`.
- Unlike [`useModalMissListener`](/screen/modal-miss-listener), allowing changes where the event ends up; listening only reports.
