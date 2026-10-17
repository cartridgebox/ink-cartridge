---
"ink-cartridge": minor
---
Add an in-place refresh to gotoScreen and stop it dropping params for on-path targets.

### Added
- `gotoScreen` takes a third argument, `options?: SkipOptions`: `gotoScreen(target, params, { onlyAttribute: true })` updates the props of a target that is already mounted — the current screen or one of its ancestors — without remounting it, so its internal state and mouse region focus survive. `SkipOptions` is now shared by `skip` and `gotoScreen`; it was already skip's option type.

### Changed
- `gotoScreen(target, params)` applies `params` to a target that is already on the current path — the current screen or one of its ancestors — and remounts it, exactly as `skip` treats the current screen. The params replace that entry's own (`template + params`) and pages below the target are dropped, as with any jump to an ancestor. Pass `{ onlyAttribute: true }` to keep the mounted instance instead.
- `useKeyboard()` re-pushes the calling element's owner for `currentScreenHasSequenceWaiting`, like it does for the other owner-scoped methods, so a call from a layer element reads that element's layer even when sibling elements sit above it on the owner stack.
- Demos live flat in `examples/` and are named `<group>-<name>.tsx`, where the prefix names the subsystem — `screen-`, `keyboard-` or `mouse-` — instead of one directory per group. The `.demo.tsx` infix, the `core/`, `layer-system/`, `xterm-mouse/` and `V5/` directories are gone, and every run command, README table, website reference and the example conventions point at the new names.
- `examples/screen-goto-screen.tsx` walks through the in-place refresh: a Counter screen keeps its internal count when refreshed with `gotoScreen(..., { onlyAttribute: true })` and loses it on a default refresh, with an ancestor jump applying params as well.
- `examples/keyboard-pending-state-layer.tsx` shows `currentScreenHasSequenceWaiting()` used from inside a layer: the layer element's own `d d` sequence drives a live "waiting for the second d" hint that clears when the pair fires or times out.
- `examples/keyboard-dormant-key.tsx` shows `stopsWorkingAfterLayerAppearing` end to end on a `focusId` binding: the page's `x` stops counting while a layer is open and counts again once it is closed.
- `examples/keyboard-composition.tsx` walks through an exclusive composition chain: `3` waits for `w`, an unrelated key is swallowed and the wait restarts, and the expired wait completes the chain into the undo buffer, where `u` undoes it.
- `README.md` gained a Versioning section: versions follow the size and the circumstances of a change rather than strict semver — major only for a large release or a large-scale refactor, minor versus patch split by scale — so the changelog is the source of truth.

### Fixed
- `gotoScreen(target, params)` no longer silently ignores `params` when the target is already on the current path. `template + params` was only ever applied inside the suffix mapping, and the suffix is empty in exactly that case, so the target kept its previous props while the counter still advanced and remounted the screen — the caller got stale props on a freshly reset component.

### Breaking Changes
None

### Tests
- `tests/screens/base/gotoScreen.test.tsx` covers all three on-path cases: the default jump (params applied, screen remounted), `{ onlyAttribute: true }` (params applied to the live instance, mount count unchanged), and a jump to an ancestor (params applied, deeper pages dropped).
