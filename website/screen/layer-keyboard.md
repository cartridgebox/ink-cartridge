# Keyboard events between layers

The layer stage sits in the middle of the key pipeline: after the modal stage, before global keys and the screen stack. Events travel **top-down** between layers and are **broadcast** within one layer. A hit stops propagation to lower layers; a miss keeps bubbling.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | Layer elements register bindings with `boundKeyboard` |
| [Basic Binding](/keyboard/base-bind) | Registering and cleaning up bindings |

## Binding attribution

`boundKeyboard` inside a layer element attaches to that element:

```tsx
function ToolPanel() {
  const { boundKeyboard } = useKeyboard()

  useEffect(() => boundKeyboard('w', () => count()), [boundKeyboard])
}
```

A binding participates only while the layer is open and the element is `active`. `useKeyboard()` injects `layerId` / `elementId` from `LayerElementContext`, so passing them by hand is normally unnecessary.

## Propagation rules

1. **Top-down**: start at the layer with the highest `zIndex` and try each layer in descending order.
2. **Broadcast within a layer**: every active element of the layer receives the event, so several handlers can respond to the same key.
3. **Stop on hit**: once any element of a layer handles the event, it is consumed and does not reach lower layers or the screen stack.
4. **Bubble on miss**: if no element of the layer handles it, the event continues to the next lower layer.
5. **Fall back to the screen stack**: if no layer handles it, the event enters the screen stack and is tried from the current screen toward the root.

```ts
openLayer('layer-b', 10)
openLayer('layer-a', 20)   // receives keys first
```

When both layers bind `return`, only `layer-a` responds; keys it does not handle fall through to `layer-b`.

When one layer mounts two elements that both bind `return`, both receive the event:

```tsx
openLayer('panel', 10)
applyElement('panel', { element: ElementA, elementId: 'a' })
applyElement('panel', { element: ElementB, elementId: 'b' })
```

## Ordering details

- Equal `zIndex` values are ordered by `createdAt`: the earlier layer sits lower, the later one higher.
- Elevation changes visual, keyboard, and mouse order together; see [Layer elevation and stacking](/screen/layer-z-index).
- Modal layers always outrank regular layers. While a modal is open, regular layers receive no key events; see [Modal layer keyboard events](/screen/modal-layer-keyboard).
- An element paused with `deactivateElement` is skipped during the broadcast; closing the layer invalidates all of its bindings.
- Within one layer the event is handled in two passes: auto-tab, wildcard fallback, and multi-key sequences are offered to every active element first, then ordinary bindings are broadcast. Once a sequence takes the key, no sibling's plain binding sees it, regardless of `applyElement` order.
