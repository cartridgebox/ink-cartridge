---
"ink-cartridge": minor
"@cartridge-engine/keyboard-engine": patch
---
Fix correctness bugs found in a source review of the screen and keyboard systems.

### Added
- `gotoScreen` takes a third argument, `options?: SkipOptions`: `gotoScreen(target, params, { onlyAttribute: true })` updates the props of a target that is already mounted — the current screen or one of its ancestors — without remounting it, so its internal state and mouse region focus survive. `SkipOptions` is now shared by `skip` and `gotoScreen`.

### Changed
- `gotoScreen(target, params)` applies `params` to a target that is already on the current path — the current screen or one of its ancestors — and remounts it, exactly as `skip` treats the current screen. The params replace that entry's own (`template + params`) and pages below the target are dropped, as with any jump to an ancestor. Pass `{ onlyAttribute: true }` to keep the mounted instance instead.
- `handleTabNavigation` matches the auto-tab key instead of assuming `"tab"`. The page-layer form takes an optional `tabKey` parameter (default `"tab"`); the element-level form reads `ctx.autoTabKey`. Forward rotation matches the bare key name, reverse rotation matches `shift+<tabKey>`.
- The `EngineProps.tabKey` JSDoc states the matching rule (`tabKey` forward, `shift+tabKey` backward) instead of the old `eventNames.includes(thisKey)` wording, which no longer described the code.
- `examples/core/goto-screen.tsx` walks through the in-place refresh: a Counter screen keeps its internal count when refreshed with `gotoScreen(..., { onlyAttribute: true })` and loses it on a default refresh, with an ancestor jump applying params as well.
- Demo files are named `*.tsx` — the `.demo.tsx` infix is gone from `examples/`, so every run command, README table, website reference and the example conventions point at the plain name.
- `currentScreenHasSequenceWaiting()` is owner-scoped all the way: a layer-id owner (an overlay or modal element) reports that layer's own pending sequence — including one armed by one of its elements — and a page owner reports the page's, whatever sits on top of the owner stack. `useKeyboard()` re-pushes the calling element's owner for this method like it does for the other owner-scoped ones, so sibling layer elements no longer answer for each other.

### Fixed
- `autoTab` rotates focus backward on Shift+Tab again. A host's `normalizeKeyNames` may drop the bare key name while a modifier is held — the bundled Ink adapter does exactly that, so Shift+Tab arrives as `["shift+tab"]` — while the rotation guard only accepted `"tab"`. Shift+Tab was therefore never intercepted: reverse rotation never ran and the key fell through to ordinary bindings.
- The documented `EngineProps.tabKey` option works. The value was written into the pipeline context as `autoTabKey` but no processor read it, so a host whose normalizer emits a different name (e.g. `"Tab"`) got no automatic focus rotation at all.
- With `autoTab` on, Shift+Tab is now consumed by the rotation as documented, so an app that bound `shift+tab` itself no longer receives it. Turn `autoTab` off to keep handling the key manually.
- `gotoScreen(target, params)` no longer silently ignores `params` when the target is already on the current path. `template + params` was only ever applied inside the suffix mapping, and the suffix is empty in exactly that case, so the target kept its previous props while the counter still advanced and remounted the screen — the caller got stale props on a freshly reset component.
- Inside a layer or modal element, `currentScreenHasSequenceWaiting()` answered about the **page**, not the layer: it reported `false` while the layer really was waiting for the next key, and threw outright when no page existed — with a message telling the caller to pass an option that no public signature accepted. The layer's own pending sequence is what a caller inside that layer is asking about; the engine's JSDoc already described it that way.

### Breaking Changes
- `SequenceListeningOptions` is gone, and `currentScreenHasSequenceWaiting()` no longer takes a second argument. The type was published as "options for `KeyboardEngine.currentScreenHasSequenceWaiting`", but the option was unreachable: the engine method, `KeyboardContextValue` and the module-level API all took `sync` only, so no working call could ever pass it.

### Tests
- `src/keyboard-engine/tests/integration/pipeline.test.ts` covers an Ink-like adapter that emits `["shift+tab"]` alone: forward rotation, backward rotation, backward wrap-around, and a custom `tabKey`.
- `src/keyboard-engine/tests/pure-functions/base/pure.test.ts` covers the page-layer matcher on a shift+tab-only event, `tabKey` and `shift+<tabKey>` matching, a differently spelled variant not being an auto-tab event, and `handleLayer` reading the key from the pipeline context.
- `src/keyboard-engine/tests/pure-functions/base/elementParser.test.ts` covers the element-level matcher on a shift+tab-only event and with a custom `autoTabKey`.
- `tests/screens/base/gotoScreen.test.tsx` covers all three on-path cases: the default jump (params applied, screen remounted), `{ onlyAttribute: true }` (params applied to the live instance, mount count unchanged), and a jump to an ancestor (params applied, deeper pages dropped).
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers `currentScreenHasSequenceWaiting` through the public API: a layer owner reports its own pending sequence with a page below it and without one, a page owner answers for the page, and a call with no owner at all still throws.
