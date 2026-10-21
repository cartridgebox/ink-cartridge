# Listening for missed modal keys

`useModalMissListener` registers a callback inside a modal layer and reports keys that the modal did not handle. It observes only; the barrier still swallows the key.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | Missed keys are the ones the barrier swallows |

## Signature

```ts
useModalMissListener(cb: ModalMissCallback, options?: ModalMissOptions): () => void
```

The callback receives a `ModalMissEvent`:

| Field | Meaning |
|---|---|
| `miss: false` | The modal handled the key |
| `miss: true` | The key was not handled; `key`, `input`, and `eventNames` describe it |

Options:

- `[monitorWhen]` {boolean} Also count keys that hit a binding whose `when` is `false`. **Default:** `false`.
- `[monitorFocusMismatch]` {boolean} Also count keys that hit a binding on a non-active focus target. **Default:** `false`.
- `[elementId]` {string} The owning element; injected automatically inside a modal element.

```tsx
const { useModalMissListener } = useKeyboard()

useEffect(
  () => useModalMissListener((evt) => {
    if (evt.miss) setHint(`Unbound: ${evt.eventNames.join(' / ')}`)
  }),
  [useModalMissListener],
)
```

## Boundaries

- Must be called inside a modal layer. It has no effect in a regular layer and returns a no-op outside a modal.
- It reports only; use [`allowModal`](/screen/allow-modal) to actually let a key through.
- The listener is cleaned up when the component unmounts or the returned unbind function runs.
