# Keyboard reception of a layer element

Every layer element has its own keyboard reception state, `active`. Pausing an element only stops it from receiving keys: it keeps rendering, its bindings stay registered, and its internal state survives.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | Mounting and removing elements |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | Paused elements are skipped during the broadcast |

## Initial state

The `active` field of `applyElement` decides whether the element receives keys after mounting:

```ts
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'panel-body',
  active: false,   // paused from mount; still renders
})
```

The default is `true`.

## Toggling at runtime

```ts
deactivateElement(targetLayerId: string, targetElementId: string): void
activateElement(targetLayerId: string, targetElementId: string): void
```

```tsx
const { deactivateElement, activateElement } = useScreenSystem()

deactivateElement('tool-panel', 'panel-body')
activateElement('tool-panel', 'panel-body')
```

A paused element is skipped by its layer's broadcast. Resuming it restores the original bindings and state.

## Boundaries

- **Pausing is not unmounting.** Rendering, `boundKeyboard` registrations, and internal state are all preserved.
- **A paused element cannot resume itself.** It receives no keys, so another element or the screen must call `activateElement`.
- **`active` affects keyboard only.** The element renders and its mouse regions keep taking part in hit-testing.
- **`eraseElement` destroys.** The element and its bindings are removed; restoring it requires mounting again.
- Modal layers use `activateElementInModalLayer` / `deactivateElementInModalLayer`, see [Keyboard response of modal-layer elements](/screen/modal-layer-element-keyboard).
