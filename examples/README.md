# Examples

Single-API demos for ink-cartridge. Each directory contains one demo file per scenario.

> The standalone component packages under `packages/discarded/` (`@cartridge-engine/*`) are
> deprecated — their demos have been removed. Only core-system and mouse demos
> remain.

## Running a demo

Before running any demo, build the workspace package:

```bash
npm run build -w @cartridge-engine/keyboard-engine
```

Then run the demo:

```bash
npx tsx examples/<component>/<Demo>.tsx
```

## Core System Demos

Screen navigation and keyboard system demos. Each demo is a self-contained file showcasing a specific scenario.

| Demo | Description | Command |
|------|-------------|---------|
| pending-state | thereGlobalQueueWaiting + currentScreenHasSequenceWaiting with sync, pending-state UI feedback | `npx tsx examples/core/pending-state.tsx` |
| pending-state-layer | `currentScreenHasSequenceWaiting()` inside a layer element: the owner decides the scope, so the hint tracks the layer's own `d d` sequence — armed, fired, or timed out | `npx tsx examples/core/pending-state-layer.tsx` |
| layer-system | Layer A/B z-index order, layer broadcast, bubbling, penetration, stop, modal barrier | `npx tsx examples/layer-system/LayerSystem.tsx` |
| takeover-scope | `automaticTakeoverKeyboard` with a page list (array): layer bindings go dormant only on listed pages and stay active elsewhere | `npx tsx examples/core/takeover-scope.tsx` |
| bring-to-front | `clickOnRise`/`dragOnRise` + `bringLayerToFront`: draggable panels that raise their layer on click or drag, topmost key routing, modal barrier comparison | `npx tsx examples/core/bring-to-front.tsx` |
| module-api | Module-level keyboard API driven entirely from plain logic (no `useKeyboard`): `addProcessor`/`setProcessorWeight`/`getProcessors`/`nextMode`/`globalKeys`, plus `getEngine` + `withOwner` for manual page bindings | `npx tsx examples/core/module-api.tsx` |
| focus-release | `releaseFocusWhenEmpty`: mounting/unmounting the last holder of a focus target adds and drops the target, focus hands off within the group, and a re-registration takes it back — with live `focusCurrent()` output | `npx tsx examples/core/focus-release.tsx` |
| goto-screen | `gotoScreen` to a screen already on the path: the default refresh remounts it with the new params, `{ onlyAttribute: true }` updates the props in place — a counter keeps or loses its count accordingly, and an ancestor jump applies params too | `npx tsx examples/core/goto-screen.tsx` |

## Mouse demos

Mouse support is built on the `xterm-mouse` fork shipped inside `@cartridge-engine/keyboard-engine`. The React adapter (`KeyboardProvider mouse` + `useMouseRegion`) registers measured element rectangles with the engine, which hit-tests xterm-mouse events against them.

| Demo | Description | Command |
|------|-------------|---------|
| mouse-hit-test | Click hit-testing against an 8x8 Ink box via `useMouseRegion` | `npx tsx examples/xterm-mouse/MouseHitTest.tsx` |
| mouse-layer-stack | Mouse hit priority across stacked layers (layer beats page, root fallback); `applyElement` with typed props | `npx tsx examples/xterm-mouse/MouseLayerStack.tsx` |
| mouse-controls | Clickable `[x]`/`[OK]` buttons on a panel (child regions win via `priority`) | `npx tsx examples/xterm-mouse/MouseControls.tsx` |
| mouse-drag | Drag a window via the press→drag→release capture lifecycle | `npx tsx examples/xterm-mouse/MouseDrag.tsx` |
| mouse-sequence | Click-to-focus fire panels driven by all three `boundSequence` calling conventions (explicit keys + actionId, explicit keys + callback, actionId with preset keys) | `npx tsx examples/xterm-mouse/SequenceMouse.tsx` |
| mouse-hover-focus | `enterOnFocus` / `leaveOffFocus` / `clickOnFocus` hover-driven focus with a leave-clears vs leave-keeps comparison | `npx tsx examples/xterm-mouse/MouseHoverFocus.tsx` |
