# Examples

Single-API demos for ink-cartridge. Every demo is one self-contained file directly under
`examples/`; the name prefix says which subsystem it belongs to:

- `screen-*` — screen navigation and layers
- `keyboard-*` — keyboard engine: bindings, sequences, focus, composition
- `mouse-*` — mouse regions and hit-testing

> The standalone component packages under `packages/discarded/` (`@cartridge-engine/*`) are
> deprecated — their demos have been removed. Only keyboard, mouse and screen demos
> remain.

## Running a demo

Before running any demo, build the workspace package:

```bash
npm run build -w @cartridge-engine/keyboard-engine
```

Then run the demo:

```bash
npx tsx examples/<group>-<name>.tsx
```

## Screen demos

| Demo | Description | Command |
|------|-------------|---------|
| screen-bring-to-front | `clickOnRise`/`dragOnRise` + `bringLayerToFront`: draggable panels that raise their layer on click or drag, topmost key routing, modal barrier comparison | `npx tsx examples/screen-bring-to-front.tsx` |
| screen-goto-screen | `gotoScreen` to a screen already on the path: the default refresh remounts it with the new params, `{ onlyAttribute: true }` updates the props in place — a counter keeps or loses its count accordingly, and an ancestor jump applies params too | `npx tsx examples/screen-goto-screen.tsx` |
| screen-layer-persistence | `crossPage: true`: a layer opened on one page survives `skip` to the next, with `automaticTakeoverKeyboard` keeping its keys active | `npx tsx examples/screen-layer-persistence.tsx` |
| screen-layer-system | Layer A/B z-index order, layer broadcast, bubbling, penetration, stop, modal barrier | `npx tsx examples/screen-layer-system.tsx` |
| screen-takeover-scope | `automaticTakeoverKeyboard` with a page list (array): layer bindings go dormant only on listed pages and stay active elsewhere | `npx tsx examples/screen-takeover-scope.tsx` |

## Keyboard demos

| Demo | Description | Command |
|------|-------------|---------|
| keyboard-composition | Composition chain with `exclusive: true`: `3` waits for `w`, an unrelated key is swallowed and the wait restarts, and the chain lands in the undo buffer once the wait expires (`u` undoes it) | `npx tsx examples/keyboard-composition.tsx` |
| keyboard-dormant-key | `stopsWorkingAfterLayerAppearing` on a `focusId` binding: the page's `x` stops responding while a layer is open and answers again once it is closed | `npx tsx examples/keyboard-dormant-key.tsx` |
| keyboard-focus-release | `releaseFocusWhenEmpty`: mounting/unmounting the last holder of a focus target adds and drops the target, focus hands off within the group, and a re-registration takes it back — with live `focusCurrent()` output | `npx tsx examples/keyboard-focus-release.tsx` |
| keyboard-module-api | Module-level keyboard API driven entirely from plain logic (no `useKeyboard`): `addProcessor`/`setProcessorWeight`/`getProcessors`/`nextMode`/`globalKeys`, plus `getEngine` + `withOwner` for manual page bindings | `npx tsx examples/keyboard-module-api.tsx` |
| keyboard-pending-state | `thereGlobalQueueWaiting` + `currentScreenHasSequenceWaiting` with `sync`, pending-state UI feedback | `npx tsx examples/keyboard-pending-state.tsx` |
| keyboard-pending-state-layer | `currentScreenHasSequenceWaiting()` inside a layer element: the owner decides the scope, so the hint tracks the layer's own `d d` sequence — armed, fired, or timed out | `npx tsx examples/keyboard-pending-state-layer.tsx` |

## Mouse demos

Mouse support is built on the `xterm-mouse` fork shipped inside `@cartridge-engine/keyboard-engine`. The React adapter (`KeyboardProvider mouse` + `useMouseRegion`) registers measured element rectangles with the engine, which hit-tests xterm-mouse events against them.

| Demo | Description | Command |
|------|-------------|---------|
| mouse-controls | Clickable `[x]`/`[OK]` buttons on a panel (child regions win via `priority`) | `npx tsx examples/mouse-controls.tsx` |
| mouse-drag | Drag a window via the press→drag→release capture lifecycle | `npx tsx examples/mouse-drag.tsx` |
| mouse-focus | Clicking a mouse region hands keyboard focus to its `focusId`, converging mouse and keyboard focus | `npx tsx examples/mouse-focus.tsx` |
| mouse-focus-groups | Each box owns its own named focus group; clicking a box toggles focus for that group | `npx tsx examples/mouse-focus-groups.tsx` |
| mouse-hit-test | Click hit-testing against an 8x8 Ink box via `useMouseRegion` | `npx tsx examples/mouse-hit-test.tsx` |
| mouse-hover-focus | `enterOnFocus` / `leaveOffFocus` / `clickOnFocus` hover-driven focus with a leave-clears vs leave-keeps comparison | `npx tsx examples/mouse-hover-focus.tsx` |
| mouse-layer-stack | Mouse hit priority across stacked layers (layer beats page, root fallback); `applyElement` with typed props | `npx tsx examples/mouse-layer-stack.tsx` |
| mouse-sequence | Click-to-focus fire panels driven by all three `boundSequence` calling conventions (explicit keys + actionId, explicit keys + callback, actionId with preset keys) | `npx tsx examples/mouse-sequence.tsx` |
