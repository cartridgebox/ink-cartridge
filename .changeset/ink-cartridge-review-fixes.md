---
"ink-cartridge": minor
---
Add an in-place refresh to gotoScreen and stop it dropping params for on-path targets.

### Added
- `gotoScreen` takes a third argument, `options?: SkipOptions`: `gotoScreen(target, params, { onlyAttribute: true })` updates the props of a target already on the current path instead of remounting it. For the current screen the mounted instance is kept, so its internal state and mouse region focus survive; an ancestor is not rendered while a deeper page is on top, so it mounts fresh either way and keeps only its stored regionFocus map. `SkipOptions` is now shared by `skip` and `gotoScreen`; it was already skip's option type.

### Changed
- `gotoScreen(target, params)` applies `params` to a target that is already on the current path — the current screen or one of its ancestors — and remounts it, exactly as `skip` treats the current screen. The params replace that entry's own (`template + params`) and pages below the target are dropped, as with any jump to an ancestor. Pass `{ onlyAttribute: true }` to update only the props — that keeps the mounted instance when the target is the current screen.
- `useKeyboard()` re-pushes the calling element's owner for `currentScreenHasSequenceWaiting`, like it does for the other owner-scoped methods, so a call from a layer element reads that element's layer even when sibling elements sit above it on the owner stack.
- Demos live flat in `examples/` and are named `<group>-<name>.tsx`, where the prefix names the subsystem — `screen-`, `keyboard-` or `mouse-` — instead of one directory per group. The `.demo.tsx` infix, the `core/`, `layer-system/`, `xterm-mouse/` and `V5/` directories are gone, and every run command, README table, website reference and the example conventions point at the new names.
- `examples/screen-goto-screen.tsx` walks through the in-place refresh: a Counter screen keeps its internal count when refreshed with `gotoScreen(..., { onlyAttribute: true })` and loses it on a default refresh, with an ancestor jump applying params as well.
- `examples/keyboard-pending-state-layer.tsx` shows `currentScreenHasSequenceWaiting()` used from inside a layer: the layer element's own `d d` sequence drives a live "waiting for the second d" hint that clears when the pair fires or times out.
- `examples/keyboard-dormant-key.tsx` shows `stopsWorkingAfterLayerAppearing` end to end on a `focusId` binding: the page's `x` stops counting while a layer is open and counts again once it is closed.
- `examples/keyboard-composition.tsx` walks through an exclusive composition chain: `3` waits for `w`, an unrelated key is swallowed and the wait restarts, and the expired wait completes the chain into the undo buffer, where `u` undoes it.
- `examples/keyboard-mapping.tsx` shows two mappings that share a prefix: `g h` runs after the wait expires (or before an unrelated key, which still reaches its own binding), and `g h j` wins when its key arrives in time.
- `README.md` gained a Versioning section: versions follow the size and the circumstances of a change rather than strict semver — major only for a large release or a large-scale refactor, minor versus patch split by scale — so the changelog is the source of truth.

### Fixed
- `gotoScreen(target, params)` no longer silently ignores `params` when the target is already on the current path. `template + params` was only ever applied inside the suffix mapping, and the suffix is empty in exactly that case, so the target kept its previous props while the counter still advanced and remounted the screen — the caller got stale props on a freshly reset component.
- `useMouseRegion` no longer drops its own registration after a screen-state change. The unmount cleanup listed the wrapped keyboard context — whose identity changes on every screen update — in its dependencies, so React ran the cleanup right after the render had registered the region, unregistering the live entry until the next layout commit. Clicks, hover and drag stopped working until the component re-rendered for another reason; a `clickOnRise` region hit this on the very click that raised its layer. The cleanup now depends only on the layer/region identity and reads the current unregister function through a ref.
- `useFocusState` reflects a changed `focusId` or group immediately. The value was cached in state and only recomputed on a focus event, so changing the parameter on an already-mounted component kept showing the previous target's answer — a reused field component could render an unfocused target as focused until the next focus move. The hook now derives the value on every render and subscribes only to re-render.
- `mouseOptions` with an inline function value no longer rebuilds mouse tracking on every render. The stability check compared every option by identity, so a fresh closure (e.g. an inline `setRawMode`) tore down and re-enabled the Mouse each render, which also dropped in-flight clicks. Function values are ignored by the stability key — the effect reads the latest options when it does rebuild — while primitives and object references still trigger a rebuild.
- `MouseReportFilter` no longer swallows an `M`/`m` keystroke while a fragment is buffered. The terminator check accepted any input ending in `M`/`m`, so a real `M` (or `m`) typed after a buffered `[<3` — a pasted fragment, or a split report whose tail never arrived — was taken for the end of a report and dropped. A report is swallowed only once it is complete (`[<button;column;row` plus `M`/`m`).

### Breaking Changes
None

### Tests
- `tests/screens/base/gotoScreen.test.tsx` covers all three on-path cases: the default jump (params applied, screen remounted), `{ onlyAttribute: true }` (params applied to the live instance, mount count unchanged), and a jump to an ancestor (params applied, deeper pages dropped).
- `tests/keyboard/mouse-region-cleanup.test.tsx` clicks a region through `processMouseEvent`, opens a layer (the page re-renders without remounting), clicks again, and then unmounts: the region keeps working across the screen-state change and is removed on unmount. Dropping the ref from the cleanup turns it red.
- `tests/keyboard/focus-state-params.test.tsx` switches a mounted probe's `focusId` without moving focus (the value must flip to `false`), moves focus (it flips back to `true`), and switches the parameter back. Caching the value in state turns it red.
- `tests/keyboard/base/mouse-report-filter.test.ts` covers a buffered `[<3` followed by `M` and by `m`: both keystrokes are released. Reverting to the terminator-only check turns it red.
- `tests/keyboard/mouse-options-stability.test.tsx` re-renders the provider with a fresh inline `setRawMode` (no rebuild) and then changes a numeric option (rebuild). Comparing functions by identity turns it red.
