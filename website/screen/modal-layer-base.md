# Modal layers

A modal layer renders above regular layers and takes over the keyboard. While any modal is open, keys it does not handle never reach regular layers or the screen. Use it for confirmations and dialogs that must own input.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | The two APIs mirror each other |
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | The takeover and barrier rules |

## Method mapping

| Regular layer | Modal layer |
|---|---|
| `openLayer` | `openModalLayer` |
| `applyElement` | `applyElementToModalLayer` |
| `closeLayer` | `closeModalLayer` |
| `eraseElement` | `eraseElementInModalLayer` |
| `closeAllLayer` | `closeAllModalLayer` |
| `activateElement` | `activateElementInModalLayer` |
| `deactivateElement` | `deactivateElementInModalLayer` |

Both kinds share the ID namespace. `CurrentScreen` renders: current screen → regular layers → modal layers.

## Opening and mounting

```ts
openModalLayer(layerId: string, zIndex: number, options?: ModalLayerOptions): void
applyElementToModalLayer(targetModalLayerId: string, layerElement: LayerElementInput<C>): void
```

`ModalLayerOptions` is the same as `LayerOptions`:

- `[crossPage]` {boolean} Keep the layer across page switches. **Default:** `false`.
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} Limit the pages on which the modal takes over the keyboard. **Default:** `false`. See [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover).

```ts
const { openModalLayer, applyElementToModalLayer } = useScreenSystem()

openModalLayer('confirm', 100)
applyElementToModalLayer('confirm', {
  element: ConfirmDialog,
  elementId: 'body',
})
```

`openModalLayer` also registers an empty container; mount elements to render anything.

## Reading modal information

```tsx
const ctx = useContext(ModalLayerElementContext)
ctx?.modalLayer.layerId
```

The mounted component can read its own modal layer without receiving the ID as a prop.

## Closing and removing

| Method | Effect |
|---|---|
| `closeModalLayer(targetModalLayerId)` | Closes the modal and all its elements |
| `eraseElementInModalLayer(modalLayerId, elementId)` | Removes one element |
| `closeAllModalLayer()` | Closes every modal layer |

Closing an unregistered ID is a no-op with a development warning.

## Boundaries

- `layerId` is shared with regular layers; reusing an ID across the two kinds throws.
- Call `openModalLayer` before mounting elements.
- Only the modal with the highest `zIndex` receives keyboard and mouse events.
- Unhandled keys are swallowed by the barrier; use [`allowModal`](/screen/allow-modal) for exceptions.
- Modal layers close on page switches by default; `crossPage: true` keeps them.
- Methods are available both from `useScreenSystem()` and as direct imports from `ink-cartridge`.
