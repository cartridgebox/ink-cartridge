---
"@cartridge-engine/keyboard-engine": patch
---
Fix auto-tab rotation, focus-target flags and pending-sequence scope.

### Added
None

### Changed
- `handleTabNavigation` matches the auto-tab key instead of assuming `"tab"`. The page-layer form takes an optional `tabKey` parameter (default `"tab"`); the element-level form reads `ctx.autoTabKey`. Forward rotation matches the bare key name, reverse rotation matches `shift+<tabKey>`.
- The `EngineProps.tabKey` JSDoc states the matching rule (`tabKey` forward, `shift+tabKey` backward) instead of the old `eventNames.includes(thisKey)` wording, which no longer described the code.
- `currentScreenHasSequenceWaiting()` is owner-scoped all the way: a layer-id owner (an overlay or modal element) reports that layer's own pending sequence — including one armed by one of its elements — and a page owner reports the page's, whatever sits on top of the owner stack.
- The `stopsWorkingAfterLayerAppearing` JSDoc states when the binding sleeps — while any layer or modal layer is open, waking up once all are closed — instead of claiming it is only active before the layer first renders, which contradicted the matcher.

### Fixed
- `autoTab` rotates focus backward on Shift+Tab again. A host's `normalizeKeyNames` may drop the bare key name while a modifier is held — the bundled Ink adapter does exactly that, so Shift+Tab arrives as `["shift+tab"]` — while the rotation guard only accepted `"tab"`. Shift+Tab was therefore never intercepted: reverse rotation never ran and the key fell through to ordinary bindings.
- The documented `EngineProps.tabKey` option works. The value was written into the pipeline context as `autoTabKey` but no processor read it, so a host whose normalizer emits a different name (e.g. `"Tab"`) got no automatic focus rotation at all.
- With `autoTab` on, Shift+Tab is now consumed by the rotation as documented, so an app that bound `shift+tab` itself no longer receives it. Turn `autoTab` off to keep handling the key manually.
- `stopsWorkingAfterLayerAppearing` now applies to a `focusId` binding. The flag was stored only on the non-focus registration path while the matcher applies the skip predicate to focus targets as well, so a focused page binding kept firing after a layer appeared instead of going dormant.
- Inside a layer or modal element, `currentScreenHasSequenceWaiting()` answered about the page, not the layer: it reported `false` while the layer really was waiting for the next key, and threw outright when no page existed — with a message telling the caller to pass an option that no public signature accepted.
- An exclusive composition chain that expires after a mismatched key now records its history and emits `completed`. The restarted wait only cleared the pending state, so the keys could not be undone and subscribers waiting for the chain to end never heard about it — the last event stayed `consumed`.

### Breaking Changes
- `SequenceListeningOptions` is gone, and `currentScreenHasSequenceWaiting()` no longer takes a second argument. The type was published as "options for `KeyboardEngine.currentScreenHasSequenceWaiting`", but the option was unreachable: the engine method, `KeyboardContextValue` and the module-level API all took `sync` only, so no working call could ever pass it.

### Tests
- `src/keyboard-engine/tests/integration/pipeline.test.ts` covers an Ink-like adapter that emits `["shift+tab"]` alone: forward rotation, backward rotation, backward wrap-around, and a custom `tabKey`.
- `src/keyboard-engine/tests/pure-functions/base/pure.test.ts` covers the page-layer matcher on a shift+tab-only event, `tabKey` and `shift+<tabKey>` matching, a differently spelled variant not being an auto-tab event, and `handleLayer` reading the key from the pipeline context.
- `src/keyboard-engine/tests/pure-functions/base/elementParser.test.ts` covers the element-level matcher on a shift+tab-only event and with a custom `autoTabKey`.
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers `currentScreenHasSequenceWaiting` through the public API (a layer owner reports its own pending sequence with a page below it and without one, a page owner answers for the page, and a call with no owner still throws) and a `focusId` binding with `stopsWorkingAfterLayerAppearing` (it fires with no layer on screen and stays silent once one appears).
- `src/keyboard-engine/tests/composition/base/composition-edge.test.ts` covers an exclusive chain that consumes a mismatched key and then expires: it emits `completed` and lands in the undo buffer.
