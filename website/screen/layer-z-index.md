# Layer elevation and stacking

Layers stack by `zIndex`. The value decides visual order, keyboard priority, and mouse hit order alike: higher is in front and receives events first. `bringLayerToFront` raises a regular layer to the top temporarily; `restoreLayerZIndex` puts it back at the level it was opened with.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | Elevation applies to regular layers |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | Stacking order decides key propagation between layers |

## Stacking rules

- `allLayers` / `allModalLayers` are sorted by ascending `zIndex`; rendering and hit-testing walk from the end of the array.
- Equal `zIndex` values are ordered by `createdAt`: the earlier layer sits lower, the later one on top.
- Modal layers always render above regular layers. No amount of elevation makes a regular layer overtake a modal.
- Elevation changes the layer's `zIndex` but not its `initialZIndex`, so it can be undone.

## bringLayerToFront(targetLayerId)

Sets the target regular layer's `zIndex` to the current maximum + 1 and re-sorts.

```ts
const { bringLayerToFront } = useScreenSystem()

bringLayerToFront('edit-panel')
```

- `targetLayerId` {string} An open regular layer ID.
- Returns: `void`.
- No-op when the layer is already on top.
- The layer object is rebuilt by spread, but its `elements`, `regionFocus`, `hostPage`, and `crossPage` references are kept, so element components do not remount and user state is preserved.
- A modal layer ID or an unregistered ID is ignored with a development warning.

## restoreLayerZIndex(targetLayerId)

Restores the target regular layer's `zIndex` to its initial value and re-sorts.

```ts
const { restoreLayerZIndex } = useScreenSystem()

restoreLayerZIndex('edit-panel')
```

- `targetLayerId` {string} An open regular layer ID.
- Returns: `void`.
- No-op when the layer is already at its initial level.
- Elements are not remounted. Modal layers and unregistered IDs are ignored with a warning.

## Raising a layer from a mouse gesture

`useMouseRegion` exposes five elevation options:

| Option | Raises when | Default |
|---|---|---|
| `clickOnRise` | The region is clicked | `false` |
| `dragOnRise` | A drag starts on the region | `false` |
| `wheelOnRise` | A wheel event lands on the region | `false` |
| `enterOnRise` | The pointer enters the region | `false` |
| `leaveOffRise` | The pointer leaves; restores `zIndex`. Only applies when `enterOnRise` is set | `true` |

The raise runs before your own callback, so `onClick` / `onEnter` already observe the new order.

```tsx
const ref = useMouseRegion(
  { onClick: () => selectPanel() },
  { clickOnRise: true },
)

// Raise on hover, restore on leave
const hoverRef = useMouseRegion(
  { onEnter: () => setHovered(true), onLeave: () => setHovered(false) },
  { enterOnRise: true, leaveOffRise: true },
)
```

Regions inside a modal do not raise regular layers: while a modal is open, mouse hit-testing only consults that modal, and a regular layer never rises above it anyway.

## Common uses

- **Click to raise**: with overlapping panels, the clicked one moves to the front.
- **Hover preview**: raise while the pointer is inside, restore when it leaves, without permanently reordering panels.
- **Drag ordering**: raise a panel before its `onDragStart` runs.

## Boundaries

| Case | Behavior |
|---|---|
| `bringLayerToFront` targets a modal or an unknown ID | Ignored with a warning: `bringLayerToFront("<id>") ignored: no regular layer with this ID is registered. Modal layers are unaffected by bringLayerToFront.` |
| `restoreLayerZIndex` targets a modal or an unknown ID | Ignored with a warning: `restoreLayerZIndex("<id>") ignored: no regular layer with this ID is registered.` |
| The layer is closed and reopened | It starts over with a new `zIndex` and `initialZIndex`; earlier elevation is not remembered |
| A page switch clears regular layers | Unrelated to elevation; retention is controlled by `crossPage`, see [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover) |

Elevation changes order only. Bindings and element state are untouched, and keyboard order always follows the same `zIndex` as the visual order.
