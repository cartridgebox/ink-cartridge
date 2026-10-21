# Keyboard response of modal-layer elements

Modal-layer elements have the same `active` state as regular-layer elements. Pausing one only stops that element from responding; the modal's keyboard barrier remains.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layers](/screen/modal-layer-base) | Mounting elements |
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | Barrier and top-modal exclusivity |

## Initial state

```ts
applyElementToModalLayer('confirm', {
  element: ElementA,
  elementId: 'element-a',
  active: false,   // paused from mount; still renders
})
```

The default is `true`.

## Toggling at runtime

```ts
deactivateElementInModalLayer(targetModalLayerId: string, targetElementId: string): void
activateElementInModalLayer(targetModalLayerId: string, targetElementId: string): void
```

```tsx
const { deactivateElementInModalLayer, activateElementInModalLayer } = useScreenSystem()

deactivateElementInModalLayer('confirm', 'element-a')
activateElementInModalLayer('confirm', 'element-a')
```

Pause and resume are normally triggered by another element inside the modal: the barrier blocks the screen, so page bindings cannot receive the key.

## Boundaries

- **Pausing is not unmounting.** The element keeps rendering; bindings and internal state are preserved.
- **The barrier survives pausing.** Even with every element paused, unhandled keys are still swallowed.
- **A paused element cannot resume itself.** Another element in the modal must call the resume method.
- **`active` affects keyboard only.** Mouse regions keep taking part in hit-testing.
- **`eraseElementInModalLayer` destroys.** The element must be mounted again to return.
