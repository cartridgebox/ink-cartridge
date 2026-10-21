# Modal layer keyboard events

The modal stage is the first stop in the key pipeline: before global keys, regular layers, and the screen stack. Three rules define it:

1. Only the modal layer with the highest `zIndex` receives keyboard events.
2. The top modal broadcasts the event to all of its active elements.
3. Keys the top modal does not handle are swallowed by the barrier and go no further.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layers](/screen/modal-layer-base) | Opening, mounting, and closing |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | Regular-layer propagation as the contrast |

## Top modal exclusivity

With several modals open, only the topmost one participates; the others stay mounted but receive no events. When the topmost closes, the next one takes over.

```ts
openModalLayer('modal-1', 100)
openModalLayer('modal-2', 200)   // only this one receives keys
```

A key `modal-2` does not handle is not passed to `modal-1`; the barrier swallows it.

## The keyboard barrier

Regular layers bubble a miss and eventually reach the screen stack. A modal does the opposite: while one is open, an unhandled key stops at the top modal and never reaches regular layers or the screen.

```tsx
function Dialog() {
  const { boundKeyboard } = useKeyboard()

  useEffect(() => boundKeyboard('return', () => confirm()), [boundKeyboard])
}
```

`return` is handled by the dialog; every other key is swallowed, so the screen's bindings do not fire.

## Broadcast within the top layer

Inside the top modal, behavior matches regular layers: the event is broadcast to every active element, so several elements can respond to the same key. The barrier still blocks propagation once the layer is done.

## Passing through and listening

- [`allowModal`](/screen/allow-modal) puts selected keys on an allowlist so they cross the barrier when the modal does not handle them.
- [`useModalMissListener`](/screen/modal-miss-listener) reports keys swallowed by the barrier.

Neither changes the "modal handles first" order.

## Boundaries

- The modal stage runs before global keys; use `allowModal` when a global shortcut must still fire while a modal is open.
- A modal with no active elements still has its barrier.
- Equal `zIndex` values are ordered by `createdAt`; the later modal is on top.
- When all modals close, the keyboard returns to regular layers and the screen stack.
