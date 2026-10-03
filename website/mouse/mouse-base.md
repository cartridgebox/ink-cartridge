# Mouse regions with `useMouseRegion`

`useMouseRegion()` registers an Ink `<Box>` as a mouse region. The engine measures the Box's actual rectangle, hit-tests terminal mouse events against it, and fires the callbacks you pass in.

```typescript
useMouseRegion(callbacks: MouseRegionCallbacks, options?: MouseRegionOptions): RefObject<DOMElement | null>
```

Attach the returned ref to a `<Box>` — the engine measures the geometry, so you never compute coordinates by hand.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Mouse regions sit on top of `KeyboardProvider`; the provider nesting has to be in place first |
| [Layer Basics](/screen/layer-base) | Hit-testing is partitioned by layer, and a region's layer decides who receives the event |

## Enabling mouse support

Mouse support is off by default. Add `mouse` to `KeyboardProvider`:

```tsx
<ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
  <KeyboardProvider mouse>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

With it on, the terminal enters mouse tracking mode and SGR mouse reports are filtered out of the keyboard stream automatically — they never reach `useInput` as garbage text.

> A TTY input stream is required. Without one the app logs `[ink-cartridge] Mouse tracking requires a TTY input stream — mouse events disabled.` and skips mouse support; everything else keeps working.

## Making a Box clickable

Three steps: take the ref, attach it to the Box, handle the callback.

```tsx
function SubmitButton() {
  const [count, setCount] = useState(0);

  const boxRef = useMouseRegion({
    onClick: () => setCount((n) => n + 1),
  });

  return (
    <Box ref={boxRef} borderStyle="round" paddingX={3} paddingY={1}>
      <Text>Click me ({count})</Text>
    </Box>
  );
}
```

**The clickable area is the rectangle the Box actually renders**, not the width of the text inside it. The test is a half-open interval:

```
x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
```

That leads to one easy to miss case: **a Box with no size and no children measures 0×0**, the expression above never holds, and the region can never be hit. So:

- For a bigger target, open up the Box with `paddingX` / `paddingY` rather than relying on whitespace around the text
- For a fixed target, set `width` / `height` directly
- A `borderStyle` border counts toward the rectangle — the cursor on the border is a hit

Call `useMouseRegion` at the top level of a component (it needs `useId` and several contexts). Don't put it in a loop or a conditional branch — one component, one region.

## Callbacks and the event object

- `onClick` {(event, rect) => void} A click hits the region.
- `onWheel` {(event, rect) => void} A wheel event hits the region.
- `onEnter` {(event, rect) => void} The mouse enters the region.
- `onLeave` {(event) => void} The mouse leaves the region.
- `onDragStart` {(event, rect) => void} The first `drag` after a press inside the region.
- `onDragMove` {(event, rect) => void} Every `drag` while dragging.
- `onDragEnd` {(event, rect) => void} The `release` that ends a drag.

`onLeave` only receives `event`; every other callback also receives the hit rectangle `rect`.

Fields on the event object:

- `x` / `y` {number} 1-based terminal column / row.
- `button` {string} `left` / `middle` / `right` / `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right` / `back` / `forward` / `none` / `unknown`.
- `action` {string} `move` / `press` / `release` / `drag` / `wheel` / `click`.
- `shift` / `alt` / `ctrl` {boolean} Whether the modifier was held during the event.
- `protocol` {string} `SGR` (modern, effectively unlimited coordinates) or `ESC` (legacy, capped at 223).
- `raw` / `data` {number | string} Raw button code from the terminal protocol / the raw ANSI sequence.

## Converting to a local cell position

`event.x` / `event.y` are absolute terminal coordinates and `rect.x` / `rect.y` is the region's top-left corner — both 1-based. Subtracting gives the 0-based offset inside the region:

```tsx
onClick: (event, rect) => {
  const col = event.x - rect.x;
  const row = event.y - rect.y;
}
```

When the region draws its own border, the content area gives up the border width too (subtract 1 for a 1-cell border):

```tsx
const col = event.x - rect.x - 1;
```

This is how cell-by-cell surfaces — tables, drawing boards — turn a click into a specific cell.

> The region rectangle is Ink's layout coordinate + 1, which assumes content renders from the terminal's top-left corner — true with `fullScreen`. If the app is not full-screen and output scrolls, terminal coordinates drift from layout coordinates and hit-testing shifts with them.

## Hover feedback

Hovering does nothing on its own — drive it from `onEnter` / `onLeave`:

```tsx
const [hovered, setHovered] = useState(false);

const boxRef = useMouseRegion({
  onEnter: () => setHovered(true),
  onLeave: () => setHovered(false),
});

return (
  <Box ref={boxRef} borderStyle="round" borderColor={hovered ? 'cyan' : 'gray'}>
    <Text>Hover me</Text>
  </Box>
);
```

`onEnter` / `onLeave` each fire once per boundary crossing, not repeatedly while moving inside the region.

## How clicks and drags differ

The two are decided completely differently:

- **Click**: a `press` followed by a `release`, with the movement on both axes within `clickDistanceThreshold` (1 cell by default) → fires `onClick` only
- **Drag**: a `press` followed by a `move` → fires `onDragStart`, then `onDragMove` on every drag, then `onDragEnd` on `release`

A few consequences worth knowing:

- An unsteady hand within 1 cell still counts as a click, so it is not misread as a drag
- Moving past the threshold stops a click event from being synthesized, so a completed drag does **not** also fire `onClick`
- The drag target is captured at `press`, so `onDragMove` keeps firing even after the cursor leaves the region
- `onDragStart` fires once per drag
- A plain click never fires `onDragEnd`

Adjust the threshold on the provider:

```tsx
<KeyboardProvider mouse mouseOptions={{ clickDistanceThreshold: 2 }}>
```

`onDragMove` is usually paired with `event.x` / `event.y` for absolute positioning — dragging a window, for example:

```tsx
onDragStart: (event) => setGrabOffset(event.x - rect.x),
onDragMove: (event) => setPosition({ x: event.x - grabOffset, y: event.y }),
```

## Wheel

The wheel goes through `onWheel`; read the direction from `event.button`, not `event.action`:

```tsx
onWheel: (event) => {
  if (event.button === 'wheel-up') scrollUp();
  if (event.button === 'wheel-down') scrollDown();
}
```

## Overlapping regions and priority

When regions overlap, `priority` decides the winner — **higher wins**, default `0`. On equal `priority`, **the later registration wins**.

Why it is needed: React mounts children before parents, so a child control registers first and, at equal priority, loses the overlap to its container. Give the control a higher `priority` than its container:

```tsx
// Container panel (the child actually registered first)
useMouseRegion({ onClick: () => selectPanel() }, { priority: 0 });

// Button inside the panel
useMouseRegion({ onClick: () => doAction() }, { priority: 1 });
```

The hit order matches the keyboard: **topmost modal layer > regular layers (later ones first) > root regions**. And **while a modal is open, only the topmost modal layer is hit-tested — a miss is final** and does not fall through to regular layers or root regions. If you want regions under an overlay to stay clickable, use a regular layer rather than a modal. See [Modal Layer Basics](/screen/modal-layer-base) for the details.

## Region identity with `regionId`

Every region needs a unique identity, auto-generated from the call site by default — usually nothing to think about. Pass one explicitly to keep a stable identity for the same region, for example as a key for drag or hover bookkeeping:

```tsx
useMouseRegion({ onDragMove: (e) => move(e.x, e.y) }, { regionId: 'window-titlebar' });
```

`regionId` is **not** a layer element id. Reusing one inside the same layer makes the later registration overwrite the earlier one.
