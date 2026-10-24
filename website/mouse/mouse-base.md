# Mouse regions

`useMouseRegion` registers an Ink `<Box>` as a mouse region. The engine measures the rendered rectangle, hit-tests terminal mouse events against it, and invokes the matching callback.

```ts
useMouseRegion(callbacks: MouseRegionCallbacks, options?: MouseRegionOptions): RefObject<DOMElement | null>
```

Attach the returned ref to a `<Box>`; the engine measures the geometry.

## Which mouse API?

| Need | API |
|---|---|
| Click, hover, or drag on a rendered Box | `useMouseRegion` |
| Raw terminal mouse events or a custom event loop | `Mouse` class, see [Raw mouse API](/mouse/mouse-raw) |

Most apps only need `useMouseRegion`; the raw API is for non-React hosts or custom hit-testing.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Mouse regions attach to `KeyboardProvider` |
| [Layer Basics](/screen/layer-base) | Hit-test priority is partitioned by layer |

## Enabling mouse support

```tsx
<KeyboardProvider mouse>
  <CurrentScreen />
</KeyboardProvider>
```

With it enabled, the terminal enters mouse tracking and SGR reports are filtered out of the keyboard stream. A TTY is required; otherwise the app logs `[ink-cartridge] Mouse tracking requires a TTY input stream — mouse events disabled.` and skips mouse support.

`useMouseRegion` calls `useKeyboard` internally, so a `KeyboardProvider` ancestor is required; rendering a region without one throws.

## Callbacks

| Callback | Signature | When |
|---|---|---|
| `onClick` | `(event, rect)` | Click |
| `onWheel` | `(event, rect)` | Wheel |
| `onEnter` | `(event, rect)` | Pointer enters |
| `onLeave` | `(event)` | Pointer leaves |
| `onDragStart` | `(event, rect)` | First drag after a press |
| `onDragMove` | `(event, rect)` | Every drag event |
| `onDragEnd` | `(event, rect)` | Release that ends a drag |

```tsx
const ref = useMouseRegion({
  onClick: (event, rect) => {
    const col = event.x - rect.x
    const row = event.y - rect.y
    setCell(col, row)
  },
})
```

Event fields:

| Field | Content |
|---|---|
| `x` / `y` | Terminal column / row, 1-based |
| `button` | `left` / `middle` / `right` / `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right` / `back` / `forward` / `none` / `unknown` |
| `action` | `move` / `press` / `release` / `drag` / `wheel` / `click` |
| `shift` / `alt` / `ctrl` | Modifier state |
| `protocol` | `SGR` or `ESC` |
| `raw` / `data` | Raw button code / ANSI sequence |

## Region rectangle

The hit area is the rectangle the Box actually renders, using a half-open interval:

```
x >= rect.x && x < rect.x + rect.width
y >= rect.y && y < rect.y + rect.height
```

- A Box with no size and no children measures 0×0 and can never be hit; use `paddingX` / `paddingY` or explicit `width` / `height`.
- Borders count toward the rectangle.
- Non-fullscreen apps that scroll can drift from layout coordinates; `fullScreen` is the reliable setup.

## Click vs drag

- **Click**: `press` then `release` within `clickDistanceThreshold` (default 1 cell) on both axes; only `onClick` fires.
- **Drag**: `press` followed by `move`; `onDragStart`, `onDragMove`, and `onDragEnd` fire. The target is captured at press, so the drag continues outside the region.
- A completed drag does not also fire `onClick`; a plain click never fires `onDragEnd`.

```tsx
<KeyboardProvider mouse mouseOptions={{ clickDistanceThreshold: 2 }}>
```

Function values in `mouseOptions` are ignored by identity; changing a number or a stream rebuilds the Mouse.

## Wheel

Read the direction from `event.button`:

```tsx
onWheel: (event) => {
  if (event.button === 'wheel-up') scrollUp()
  if (event.button === 'wheel-down') scrollDown()
}
```

## Overlap and priority

- Higher `priority` wins; default `0`. Equal priority means the later registration wins.
- Children usually register before parents, so give a child control a higher `priority` than its container.
- Hit order: topmost modal > regular layers (later first) > root regions.
- While a modal is open, only its topmost layer is hit-tested; a miss is final. See [Modal layer keyboard events](/screen/modal-layer-keyboard).

```tsx
useMouseRegion({ onClick: selectPanel }, { priority: 0 })  // container
useMouseRegion({ onClick: doAction },    { priority: 1 })  // inner button
```

## Region identity and elevation

```ts
useMouseRegion(callbacks, {
  regionId: 'window-titlebar',
  clickOnRise: true,
  enterOnRise: true,
  leaveOffRise: true,
})
```

- `regionId` is unique within a layer; it is not a layer element ID, and reusing one overwrites the earlier registration.
- `clickOnRise` / `dragOnRise` / `wheelOnRise` / `enterOnRise` raise the surrounding regular layer on the matching gesture; `leaveOffRise` restores it on leave. See [Layer elevation and stacking](/screen/layer-z-index).

## Boundaries

- Call it at the top level of a component, not in a loop or conditional; one component, one region.
- Regions receive nothing when mouse support is off or the streams are not TTYs.
- Mouse hit-testing ignores `active` and `automaticTakeoverKeyboard`; those affect the keyboard only.
- To consume the parsed event stream directly, use [`Mouse`](/mouse/mouse-raw).
