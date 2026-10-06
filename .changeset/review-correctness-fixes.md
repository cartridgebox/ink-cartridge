---
"ink-cartridge": minor
"@cartridge-engine/keyboard-engine": patch
"@cartridge-engine/i18n": patch
"@cartridge-engine/theme": patch
---
Fix a batch of correctness bugs found in a source review, and normalize error-message prefixes to `[ink-cartridge]`.

### Added
- `ink-cartridge` now exports `activateElement` and `deactivateElement` from the package root; previously only their `*Fn` types were reachable.
- `ink-cartridge` now exports `activateElementInModalLayer` and `deactivateElementInModalLayer` from the package root as well.

### Changed
- Error and warning messages use the `[ink-cartridge]` prefix instead of the capitalized `[Ink-Cartridge]` spelling, so code that matches those strings should switch to the new prefix.
- The vendored `[xterm-mouse]` prefix for validation errors is gone; those messages use `[ink-cartridge]` too.
- Messages raised by the keyboard-engine package keep their `[keyboard-engine]` prefix.
- Navigation and layer validation failures no longer throw from inside the reducer: React cannot surface a `useReducer` throw at the dispatch call site, so those errors used to tear the whole app down.
- Those validation failures now warn in development and leave the previous state unchanged; production builds stay silent and simply ignore the action.
- `getGlobalKeys()` returns a copy, like `getGlobalSequences()`, so a caller can no longer mutate engine state through the returned array.
- A global sequence that is already pending keeps the pending slot: pressing the first key of a sequence from the other `affectLayer` phase no longer silently replaces the armed one.
- `MouseReportFilter` releases input that can no longer be part of an SGR report instead of swallowing it, so typing after a pasted `[<` fragment reaches the app again.
- The ANSI parser's run-length de-duplication is now documented as a deliberate trade-off: it also collapses two genuine identical reports that arrive in one read chunk, such as a fast wheel or a same-cell double press.

### Fixed
- A failed `registerComponent` no longer leaves a half-registered component behind: the parent is validated before the registry is mutated.
- Composition chains that end on an `isEndKey` match now emit the `completed` event, which only the timeout path emitted before.
- Composition chains that end because `execute` returned `null` now emit `completed` as well.
- A chained key rejected by an input/output value guard now emits `broken`, the same event a no-match break emits, instead of ending silently.
- `undo(steps, { byKey: true })` removes only the entries it actually undid; an early stop used to drop the keys it never undid.
- `undo(0, { byKey: true })` is a no-op instead of crashing with a `TypeError`.
- `boundKeyboard` no longer leaves global-key overrides behind when it throws, which used to suppress the global key for good.
- `useMouseRegion` forwards focus through the owner scope, so clicking a lower layer's region focuses it instead of silently no-oping.
- A shared engine stays registered until its last provider unmounts, instead of being dropped when any one provider unmounts.
- Re-creating the `mouseOptions` object inline no longer tears down and rebuilds the `Mouse` on every render; only a real option-value change does.
- `prevMode()` from no-mode state enters the last registered mode, mirroring `nextMode()`.
- `back(NaN)` and fractional levels are rejected by the guard instead of slipping through `slice(0, -levels)` and emptying the navigation path.
- The ESC mouse decoder masks modifier bits, so a modified wheel decodes as a wheel instead of an unknown press.
- `TTYController.enable()` rolls back the mouse-on codes when it fails partway, instead of leaving the terminal stuck in mouse mode.
- `TTYController.disable()` writes the mouse-off codes before anything else can fail, so a throwing `pause()`/`setRawMode()` cannot skip them.
- The `TTYController` GC fallback restores the previous raw-mode value instead of forcing raw mode off.
- With one ref shared by several bindings, the region-focus map falls back to the latest live entry when the newest registration is released.
- `normalizeKeyNames` treats `undefined`/`null` descriptors as no flags instead of throwing.
- `isInkSpecialKey` treats `undefined`/`null` descriptors as a normal character instead of throwing.

### Breaking Changes
None

### Tests
- `tests/screens/base/registry.test.tsx` covers the failed-parent rollback.
- `tests/screens/base/public-exports.test.ts` covers the newly exported functions.
- `tests/screens/base/back.test.tsx` covers the strict `levels` guard and the ignored out-of-range `back()`.
- `tests/screens/base/overLay.test.tsx` covers the ignored apply-to-unopened-layer action.
- `src/keyboard-engine/tests/composition/base/composition-edge.test.ts` covers the `completed` event for end-key and `execute → null` endings.
- `src/keyboard-engine/tests/composition/base/composition-edge.test.ts` also covers the `broken` event for value-guard rejections.
- `src/keyboard-engine/tests/composition/base/composition-edge.test.ts` covers by-key undo partial failures and the zero-step no-op.
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers the global-key override rollback.
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers `prevMode` from no-mode state.
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers the global-sequence pending slot.
- `src/keyboard-engine/tests/engine/base/engine.test.ts` covers the getter copies.
- `src/keyboard-engine/tests/xterm-mouse/parser/base/ansiParser.test.ts` covers the ESC wheel modifier mask.
- `src/keyboard-engine/tests/xterm-mouse/core/base/TTYController.test.ts` covers the enable rollback and the disable ordering.
- `src/keyboard-engine/tests/xterm-mouse/utils/base/validation.test.ts` covers the normalized prefixes.
- `tests/keyboard/region-focus.test.tsx` covers mouse-region focus across sibling layers and the shared-ref fallback.
- `tests/keyboard/mouse-options.test.tsx` covers the inline-options stability.
- `tests/keyboard/module-api.test.tsx` covers shared-engine registration and the real `clearShortcutOperations` forwarding.
- `tests/keyboard/base/mouse-report-filter.test.ts` covers the report-prefix filtering.
- `tests/keyboard/mouse-filter-integration.test.tsx` covers typing after a pasted `[<` fragment.
- `tests/keyboard/base/keyNormalizer.test.ts` covers the junk-descriptor inputs.
- `tests/screens/base/provider-multi-instance.test.tsx` and `packages/i18n/tests/base/provider.test.tsx` had their prefix assertions updated.
