# Layer z-index

Layers stack in the order they are opened; `bringLayerToFront` raises one layer to the very top, and `restoreLayerZIndex` returns it to the level it was opened at. It is commonly used to raise an obscured layer on click / hover.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | Both functions act on regular layers |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | The stacking order decides the layer-to-layer key propagation order |

## bringLayerToFront(targetLayerId)

Raises the target layer to the very top.

- `targetLayerId` {string} The target layer id.
- Returns: nothing.

Sets the layer's `zIndex` to the current maximum + 1 and re-sorts. It is a no-op when the layer is already on top; element references and user state are preserved (no remount). It does not change the initial level the layer was opened at, so `restoreLayerZIndex` can bring it back. Modal layers are unaffected — passing a modal id is ignored with a warning.

## restoreLayerZIndex(targetLayerId)

Returns the target layer to the level it was opened at.

- `targetLayerId` {string} The target layer id.
- Returns: nothing.

Sets `zIndex` back to its initial value and re-sorts; a no-op when it is already at the initial level.

## Example

The `clickOnRise` / `enterOnRise` options of `useMouseRegion` call `bringLayerToFront` / `restoreLayerZIndex` internally.

```tsx
const { bringLayerToFront, restoreLayerZIndex } = useScreenSystem()

bringLayerToFront("edit-panel")    // raise to front
restoreLayerZIndex("edit-panel")   // put back
```

## Warnings

| Case | Warning |
|---|---|
| `bringLayerToFront` target is not a registered regular layer | `bringLayerToFront("<id>") ignored: no regular layer with this ID is registered. Modal layers are unaffected by bringLayerToFront.` |
| `restoreLayerZIndex` target is not a registered regular layer | `restoreLayerZIndex("<id>") ignored: no regular layer with this ID is registered.` |
