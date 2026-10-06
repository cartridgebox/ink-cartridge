# @cartridge-engine/keyboard-engine

## 3.0.1

### Patch Changes

- 9b05501: Fix a batch of correctness bugs found in a source review, and normalize error-message prefixes to `[ink-cartridge]`.

  ### Added

  - `ink-cartridge` now exports `activateElement` and `deactivateElement` from the package root; previously only their `*Fn` types were reachable.
  - `ink-cartridge` now exports `activateElementInModalLayer` and `deactivateElementInModalLayer` from the package root as well.

  ### Changed

  - Error and warning messages use the `[ink-cartridge]` prefix instead of the capitalized `[Ink-Cartridge]` spelling, so code that matches those strings should switch to the new prefix. Message text only — no API is removed or changed.
  - The vendored `[xterm-mouse]` prefix for validation errors is gone; those messages use `[ink-cartridge]` too.
  - Keyboard-engine messages keep their existing split: package-specific messages use `[keyboard-engine]`, the shared validation messages that used the capitalized spelling now use `[ink-cartridge]`.
  - `useMouseRegion` now requires a `<KeyboardProvider>` ancestor: it forwards focus through the owner-scoped wrappers from `useKeyboard`, which throw without a provider. A region rendered without one used to silently skip focus forwarding; it now fails at render time.
  - Navigation and layer validation failures no longer throw from inside the reducer: React cannot surface a `useReducer` throw at the dispatch call site, so those errors used to tear the whole app down. Not breaking — the throw was never observable from the call site, so no working error-handling contract is removed; errors from the reducer that are not validation failures still propagate.
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

## 3.0.0

### Major Changes

- 40a88af: Return boolean from focus mutators and action/processor registration instead of throwing.

  ### Added

  None

  ### Changed

  - `focusUnregister(focusId, groupOrOptions?)` now returns `true` when a focus target was actually removed and `false` on any no-op path — no active owner, unresolved layer, or unknown group/target. Previously it returned `void`, so callers could not distinguish a real removal from a silent miss.
  - `focusSet`, `focusNext`, and `focusPrev` now return `boolean` — `true` when the active focus changed, `false` on any no-op path (no owner, unresolved layer, unknown group, target not found, the target is already active, or the group holds fewer than two targets) — instead of throwing. The focus-mutator family is now consistent with `activateFocusGroup` / `kickFocusGroup`.
  - `addAction` and `addSequenceAction` return `boolean` (false on a duplicate id); `removeAction` and `removeSequenceAction` return `boolean` (false when not registered); `modifyAction` and `modifySequenceAction` return `boolean` (false when the action is missing, has no preset keys, or has no default timeout). This matches `addCondition` / `removeCondition` / `removeProcessor`.
  - `addProcessor` returns `false` on a duplicate id or a missing `before`/`after` target; an out-of-range `index` still throws.
  - `modifySequenceAction` now treats `timeout: 0` as a passed timeout (the guard is `timeout !== undefined` instead of a truthy check), so `0` overwrites a default timeout rather than being ignored.
  - `defineShortcutAction` and `defineSequenceAction` are now atomic and return `boolean`: if any id already exists, or repeats within the batch, nothing is registered and `false` is returned instead of throwing part-way and leaving partial state.

  ### Fixed

  None

  ### Breaking Changes

  - The focus mutators (`focusSet`, `focusNext`, `focusPrev`) and the action/sequence CRUD (`addAction`, `addSequenceAction`, `removeAction`, `removeSequenceAction`, `modifyAction`, `modifySequenceAction`) no longer throw on a duplicate or missing id; code that caught these errors must check the boolean return value instead.
  - `addProcessor` no longer throws on a duplicate id or a missing `before`/`after` target; it returns `false`. An out-of-range `index` still throws.
  - `defineShortcutAction` / `defineSequenceAction` no longer throw on a duplicate id; they return `false` and register nothing (previously they threw part-way, leaving earlier entries registered).
  - The exported helpers `setIfAbsent`, `deleteIfPresent`, and `modifyEntryKeys` no longer throw and dropped their trailing error-message parameters: `setIfAbsent` / `deleteIfPresent` now return `boolean`, `modifyEntryKeys` returns `T | undefined`.
  - `modifySequenceAction(actionId, keys, 0)`: `0` is now treated as a passed timeout — it overwrites an existing default timeout, and returns `false` (leaving the preset keys untouched) for an action without one. Previously a falsy `0` was ignored.

  ### Tests

  - Added `true`/`false` assertions for `focusUnregister` on default and grouped targets and its no-op paths.
  - Updated the keyboard-engine `engine` and `LayerManager` base tests to assert the `true`/`false` contract of the focus mutators, action/sequence CRUD, and `addProcessor`; added tests for atomic `defineShortcutAction` batches, single-target focus groups (no false "moved"), and `modifySequenceAction` leaving preset keys untouched on a failed timeout; rewrote the `setIfAbsent` / `deleteIfPresent` / `modifyEntryKeys` unit test.

## 2.2.2

### Patch Changes

- fa7d630: Fix composition-engine bugs around `when` gating, mapped chains, and undo removal.

  ### Added

  None

  ### Changed

  - `when` is now evaluated while filtering candidates, in one place shared by composition keys and mapping keys, so a closed gate skips only its own entry and a sibling entry for the same key with an open gate can still match. Previously composition `when` was checked only after a single entry had been selected, and mapping `when` was never read at all.
  - The `isEndKey` JSDoc now matches the implementation: `execute` still runs before the end-key check (its side effects happen), but its returned context is discarded and the key is not recorded.

  ### Fixed

  - Honour `when` on mapping keys — it was documented but never evaluated, so a gated mapping fired unconditionally. The gate is re-checked on every key of a sequence, mirroring `globalSequence`.
  - Mapped target chains now pass the same gates as typed keys. A target key's `when` is honoured, and a `null` `lastFlag` uses the declared `flags` transition (`chooseFlag`) instead of falling back to `alternativeFlag`, so a chain behaves identically whether it is typed or triggered through `addMapping`. Value-schema input validation reads the running chain's own value, so a mapped continuation key is no longer checked against the engine's idle context (which made any schema-guarded mapped chain break where typing it worked). `runTargetChain` and `processPending` now share one `executeResolvedKey` helper so the two paths cannot drift.
  - `undo` no longer deletes sequences it did not undo. When a sequence's `undoAction` returns `null` and stops the walk, the sequences not reached stay in the buffer and only the entries actually undone are removed — a partially-undone sequence is truncated rather than dropped, and its already-run actions are not replayed by the next undo. The `undone` event now reports how many sequences were actually undone instead of the requested count, matching its documentation, and fires even when the walk stopped before completing a sequence but still truncated one (with `steps: 0`), so subscribers can re-read the ledger.
  - A single-key mapping whose target chain breaks no longer falls through to a composition key sharing the same head, which previously fired the same physical key twice.
  - A mapped target chain that ends by design reaches the undo ledger like a typed one: when `execute` returns `null`, the keys already executed are recorded (the mapping still reports `broken`), and when a target key matches an `isEndKey`, the mapping reports `completed` and records them. Previously both cases discarded the executed keys and reported `broken`, so the same keys were undoable when typed and un-undoable when mapped.
  - Include a string `when` in the composition fingerprint so two entries that differ only by their condition id are no longer silently deduplicated.

  ### Breaking Changes

  None

  ### Tests

  - `tests/composition/base/composition-regression.test.ts` covers gated single- and multi-key mappings, `when` parity, declared-flag transitions and schema-validated continuations in mapped target chains, released mappings not reaching composition, mapped chains that end by design (end key → `completed`, `execute` returning `null` → `broken`, both undoable), partial undo removal (isolated and flat, including a truncated sequence whose already-run actions must not replay), and string-`when` entry selection. Each new test was mutation-verified.

## 2.2.1

### Patch Changes

- c78ded5: - **refactor**(keyboard-engine): mouse hit-testing no longer builds and sorts a candidate array on every event — `hitLayer` scans a layer's regions in place, dropping the per-hit `O(R log R)` sort and `O(R)` allocation. `Map` insertion order already encodes registration order, so `>=` on priority reproduces the old (priority desc, registration order desc) tie-break exactly. The verbatim-duplicate `hitRoot` and the now-unused `hitCandidates` are gone, and `hitTest`'s modal branch collapses to a single return — a miss on the top modal is still dead, no fall-through. Public API and behavior are unchanged.

## 2.2.0

### Minor Changes

- ba69e11: - **feat**(composition): add a `cancelled` mapping-key event so subscribers can clear a "waiting for the next key" state when a mapping sequence is dropped by its timeout, by `abort()`, or by `undo()`. A timeout was previously silent, making it indistinguishable from a sequence still in progress.
  - **fix**(composition): record a mapped target chain in the undo history, one entry per target key, exactly as if the user had typed those keys. A chain that fired through `addMapping` used to be un-undoable, so `undo` behaved differently depending on how the same keys were triggered.
  - **fix**(composition): cancel a pending mapping sequence in `abort()`. A half-typed prefix stayed armed, so `g` → Escape → `h` still fired the `g h` mapping after the abort.
  - **fix**(composition): clear the recorded history after buffering it, so a chain is never recorded twice. Calling `abort()` after a chain had already completed on timeout duplicated the entry, and `undo` then replayed its `undoAction` more than once.
  - **fix**(composition): honour the `timeout` declared on a mapping entry. It was silently replaced by the engine-wide default, so a tighter timeout never took effect and a slower key sequence still matched.
  - **fix**(composition): drop a partial chain rejected by a `when` condition without recording it, matching how a broken match or a failed value guard behaves. A chain is only undoable once it reaches a terminal state (timeout, end key, `execute` returning `null`, or an explicit abort).

### Patch Changes

- fa92ccb: - **docs**(readme): point the API-doc links at the cartridgebox.art domain — the repo moved to the cartridgebox org and Pages now serves the custom domain, so every `baigaoa.github.io/ink-cartridge` URL returned 404.

## 2.1.15

### Patch Changes

- 76d1ab0: - **docs**(keyboard-engine): the `penetration` JSDoc no longer claims that a penetrated key passes through a stop rule — a key that is both penetrated and stopped on the same layer is stopped there, `stop` taking priority over penetration. The `stop` JSDoc now states the same precedence, and the two methods cross-reference each other.

## 2.1.14

### Patch Changes

- a222cb2: - **feat**(keyboard-engine): runtime pipeline management is now O(1) per id lookup instead of scanning the whole pipeline, so applications that add, remove, or re-weight processors on the fly no longer pay a full flatten-and-walk per call. An id-keyed `processorIndex` maps each processor id to its processor and the stage holding it — covering `addProcessor`'s duplicate check and its `before`/`after` target lookup, `removeProcessor`, `kickProcessor`, and `activeProcessor` — and a lazily built flattened snapshot is cached for `getProcessors` so repeated introspection skips re-flattening. Both caches are invalidated when the pipeline's structure changes (add / remove / re-weight / reset) and kept across `active` toggles, which never change the shape. No public API or runtime behavior change.
  - **docs**(keyboard-engine): pipeline JSDoc resynced to the cached internals — the `PipelineManager` class docs describe the two caches and their invalidation rules, `getProcessors` documents that it still returns a fresh copy of the cached flatten, `activeProcessor` now names `addProcessor` and `setProcessorWeight` alongside `removeProcessor`/`resetProcessors` as the operations that alter the pipeline, and `EngineState._processors` notes it must only be mutated through `PipelineManager`.
  - **test**(keyboard-engine): existing pipeline suites (`pipeline-stage`, `pipeline-weight`, `integration/pipeline`) pass unchanged — the optimization is behavior-preserving; `getProcessors` keeps its fresh-array-per-call contract.

## 2.1.13

### Patch Changes

- 6a35637: - **feat**(keyboard-engine): the processor pipeline is now a list of **stages** — processors that share a `weight` form one stage, and stages stay sorted by weight (higher runs first). This replaces the flat, strictly-ordered chain introduced with weight ordering.
  - **breaking**(keyboard-engine): `processKey` consumes a stage as a whole — every active member observes the event in insertion order, and the stage counts as consumed when any of them returns `true`. A processor that returns `true` no longer stops its same-stage siblings, so equal-weight processors are no longer mutually exclusive.
  - **breaking**(keyboard-engine): `addProcessor` positions in stage terms — `{ index }` is now a 0-based **stage** slot (it used to be a processor slot), and `{ before }` / `{ after }` insert a new stage just above/below the stage holding the named processor instead of resolving to a processor-level offset.
  - **feat**(keyboard-engine): an out-of-range `{ index }` now throws `[ink-cartridge] Cannot insert processor "…" at index …` instead of silently falling back to weight 0.
  - **feat**(keyboard-engine): `setProcessorWeight` relocates a processor between stages — it joins the stage that already carries the target weight, or opens a new one — and drops the stage it leaves empty. `removeProcessor` likewise removes only the target from its stage and drops the stage once it is empty, so removing one member of a shared stage no longer takes its siblings with it.
  - **breaking**(keyboard-engine): drop the engine-stamped `createAt` field from `PipelineProcessor` and the internal registration counter. Equal weights are no longer tie-broken by registration order; they share a stage and run in insertion order.
  - **docs**(keyboard-engine): pipeline JSDoc resynced to the stage model — `addProcessor`, `setProcessorWeight`, `processKey`, `getProcessors`, `kickProcessor`, `PipelineProcessor`, `ProcessorInput`, `KeyboardProcessorProps`, `builtinProcessorWeights`, and `EngineState`.
  - **test**(keyboard-engine): add `tests/engine/base/pipeline-stage.test.ts` covering stage grouping, stage-atomic consumption (including consumption from the final stage), stage-based `index`/`before`/`after`, out-of-range index errors, and stage relocation/removal; update `pipeline-weight.test.ts` for the removed `createAt`.
  - **breaking**(ink-cartridge): the re-exported pipeline types follow the stage model — `PipelineProcessor` no longer carries `createAt`, and `KeyboardProcessorProps.index` positions by stage slot.
  - **docs**(ink-cartridge): the `KeyboardProvider` `processors` prop JSDoc now describes stage-slot positioning, and its example passes a valid `ProcessorInput` (the old example used a top-level `id` field that never existed on `KeyboardProcessorProps`).

## 2.1.12

### Patch Changes

- b775a34: - **feat**(keyboard-engine): pipeline processors are now ordered by `weight` — higher runs first, equal weights keep registration order via the engine-stamped `createAt`. The nine built-in stages carry default weights exported as `builtinProcessorWeights` (`modal` 8000 → `screen-stack` 0). `addProcessor` accepts an explicit `{ weight }`, or positions by `index` / `before` / `after` as sugar resolved to the weight of the targeted slot; without options a processor defaults to weight 0 (after all built-in stages).
  - **feat**(keyboard-engine): new `setProcessorWeight(id, weight)` re-assigns a processor's weight at runtime and immediately re-sorts the pipeline, so applications can reorder stages without removing and re-adding them. It is also exposed through `useKeyboard()` on the React adapter.
  - **refactor**(keyboard-engine): kicking/activating now toggles each processor's `active` flag — inactive stages are skipped before `process()` runs and the `noActiveProcessor` list is removed. `addProcessor` now accepts the leaner `ProcessorInput` (`id` + `process`, optional `active`); `weight` and `createAt` are injected by the engine to build the full `PipelineProcessor`.
  - **breaking**(keyboard-engine): removed the `BuiltinProcessorId` union type and the `_insertRelative` export, and processor factories (`createModalProcessor`, `createCompositionProcessor`, …) now return `ProcessorInput` — weight ordering supersedes fixed-position insertion.
  - **feat**(ink-cartridge): re-export `builtinProcessorWeights` and the `ProcessorInput` type from the framework root.
  - **test**(keyboard-engine): add coverage for weight ordering, equal-weight registration ties, engine-stamped processor fields, inactive-processor skipping, and runtime re-weighting.

## 2.1.11

### Patch Changes

- 64c9985: - **fix**(keyboard-engine): correct misspelled public type names — `CompositioKey` is now `CompositionKey`, `CompositionPneding` is now `CompositionPending`, and the `TComponet` generic parameter on `CompositionKey`/`MappingKeyEntry`/`PrimitiveTypeKeys` is now `TComponent`
  - **fix**(ink-cartridge): re-export the corrected `CompositionKey` type

## 2.1.10

### Patch Changes

- 4c918cd: Fix two keyboard-engine defects in the composition and modal subsystems:

  - `undo()` now clears any in-flight composition (or mapping) chain before undoing. Previously a pending chain survived `undo()`, keeping `startPending()` from beginning a new chain until the stale timeout fired.
  - The modal barrier now treats a focused element's own `when`-disabled `allowedKeys` as blocked, so a key the focused element disabled no longer penetrates the modal.

## 2.1.9

### Patch Changes

- 30c6941: - **docs**(`@cartridge-engine/keyboard-engine`): mouse-region docs updated to match the stacked-modal hit-testing semantics shipped in the previous patch — only the topmost modal layer is consulted while any modal is open, and a miss on it is dead (no fall-through to lower modals, regular layers, or root regions). Previously the docs still described the old behavior (all modal layers hit-tested top-down). Updated in `MouseRegionService` (class and `hitTest` JSDoc), `KeyboardEngine#registerMouseRegion`, and the `MouseRegionEntry` type. No runtime changes.

## 2.1.8

### Patch Changes

- 9732bad: - **fix**(`@cartridge-engine/keyboard-engine`): with **stacked modal layers** open, mouse hit-testing now consults **only the topmost modal layer**. Previously it walked every modal layer from the top down, so a click on a lower modal's still-visible region (e.g. its Cancel button sticking out past the top modal) fired that lower modal's callbacks even though the top modal was meant to take over mouse input. This matches the keyboard side, where the modal processor has always offered events to the topmost modal layer only. While any modal is open, an event that misses the top modal is dead — it never falls through to lower modals, regular layers, or root regions.

  - **test**(`@cartridge-engine/keyboard-engine`): new integration test `tests/integration/stacked-modal-mouse-regions.test.ts` reproduces the stacked-modal scenario (offset modal layers, each with a body and a Cancel-button region): clicks/hover/wheel over a lower modal's visible button are ignored, the topmost modal's button wins over its own body via `priority`, closing the topmost modal promotes the next one, and the modal barrier still blocks fall-through to regular layers. The test fails against the previous behavior and against mutations of the fix, and passes with it in place.

## 2.1.7

### Patch Changes

- 2ad5ef2: ### boundSequence: third calling convention — explicit keys + sequence action id

  `boundSequence` now supports `boundSequence(keys, actionId, options?)` alongside the existing explicit-keys+callback and action-id forms. The action's callback is resolved at registration time; its preset timeout acts as a default, overridable per call. The action does **not** need preset keys in this form, and the explicit keys take precedence over any preset ones. Type signatures updated across `KeyboardEngine`, `KeyboardContextValue`, and the React `useKeyboard` adapter (including `SequenceReactOptions` for `ref`-based region focus).

  ### boundSequence focusId creates its focus target

  A `focusId`-scoped `boundSequence` now lazily creates (and auto-activates, when first) the focus target on its layer — matching `boundKeyboard`. Previously the sequence's focus filtering could never match because `currentFocusIds` stayed empty, and `focusSet` on such an id threw "focus target not found".

  ### Region focus: mouse → keyboard focus convergence

  Clicking a mouse region (`useMouseRegion`) now forwards keyboard focus to the `focusId` recorded by a `boundKeyboard`/`boundSequence` `{ ref, focusId }` call, so the mouse and the keyboard converge on one focus target. Forwarding runs before the user's own `onClick`, and components react via `useFocusState`.

  - `clickOnFocus` (default `true`) — click forwards focus; set `false` to keep clicks purely on the mouse callbacks
  - `enterOnFocus` — hover enter forwards focus
  - `leaveOffFocus` (default `true`, only when `enterOnFocus` is set) — hover leave clears focus via `kickFocusGroup`; `false` keeps it
  - Layer/modal scoping mirrors keyboard ownership: the owning element's `regionFocus` map is resolved and the element id is injected, so regions inside layers and modals forward correctly
  - Region entries no longer carry a transient `focused` flag
  - New public types: `RegionFocusEntry`, `RegionFocusMap`, `Page`, `FocusRef`, `SequenceReactOptions`

  ### Keyboard engine: reference-counted region-focus entries

  `registerMouseRegion`'s ref → focusId entries are reference-counted per map, so a ref shared by several bindings is only released when the last binding unbinds.

  ### confirm-dialog

  Test mocks updated for the `regionFocus` field on layer/modal state.

  ### keyboard-engine: additional public type exports

  `BaseBoundKeyEntry`, `PageBoundKeyEntry`, `PageKeyboardLayer`, `ElementKeyboard`, `LayerKeyboardLayer`, `MissListener`, `FocusSetOptions`, `MouseEventBase`, `SGRMouseEvent`, `ESCMouseEvent`, `undo`, `ListenerFor`, `TypedEventListener`, `ErrorEventListener`, `EventByAction`, `ButtonType`, and `NoneButton` are now exported (previously reachable only through star re-exports); typedoc warnings resolved.

## 2.1.6

### Patch Changes

- d129474: - **feat**(`blots-editor`): the floating toolbar is now draggable — press and drag any tool button to move the bar, clamped so it never leaves the terminal view. The buttons forward drag events to the bar because the engine captures a drag on the pressed region only; clicking (without movement) still fires the tool's action.
  - **fix**(`blots-editor`): opening the toolbar layer no longer throws `Navigation function called before Provider is mounted` when the editor is the initial screen. Passive effects run child-first on mount, so the layer open is deferred one tick until the `ScenarioManagementProvider` has registered its dispatcher.
  - **docs**(`ink-cartridge`): all comments rewritten and completed — Chinese comments translated to English, decorative separator comments removed, and every public symbol now has a detailed English JSDoc (typedoc's `notDocumented` validation reports zero gaps), with `@example` blocks added to the key hooks, providers, and layer functions. API documentation is now generated by typedoc into the root `documents/` directory (`npm run docs`) and auto-published to GitHub Pages on every push to `main`; the hand-written `docs/` tree was removed.
  - **docs**(`@cartridge-engine/keyboard-engine`): the same comment overhaul — including rewriting the previously machine-translated comments in `CompositionEngine.ts` — plus detailed JSDoc migrated from the deleted hand-written API reference (pipeline ordering, binding option semantics, drag lifecycle, focus/composition/mapping rules). Twenty-five new named types were extracted purely for documentation (`FocusRef`, the eight `Composition*Event` variants, the five `MappingKey*Event` variants, `FocusResult`, `FocusCurrentResult`, `HoveredRegion`, `MousePosition`, `MouseStreamEvent`, `ModalMissHandledEvent`, `ModalMissUnhandledEvent`, `FocusTargetsMap`, `CurrentFocusId`, `EntryWithOptionalKeys`, `FlagTransition`) — additive type exports only, no runtime or shape changes.

## 2.1.5

### Patch Changes

- f883b98: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area when an element's **absolute position** changes while its own relative layout stays fixed — e.g. a child control inside a draggable modal frame. The rect was previously re-measured only during render, so after dragging a modal frame the frame re-registered its new rect while the overlapping children (sensitivity bar, language rows) kept the pre-move rect: a press on the bar hit the frame instead, and the frame followed the cursor. The hook now subscribes to Ink's root layout listeners (the same `internal_layoutListeners` set `useBoxMetrics` uses) and re-measures unconditionally after every layout commit, so region rects follow ancestor moves even when the component never re-renders — which React's children bailout (unchanged element reference) and `useBoxMetrics` (own relative metrics only) both previously prevented.
  - **fix**(`blots-editor`): dragging the language / sensitivity modal frame no longer breaks the controls inside it — after moving the frame once, pressing and dragging the sensitivity bar (or clicking a language row) hits the control instead of re-dragging the frame.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-ancestor-move.test.tsx` reproduces the reported scenario — an absolutely-positioned draggable frame with an overlapping child region. It fails with the fix removed (a click at the child's new position lands on the frame) and passes with it in place.

## 2.1.4

### Patch Changes

- c56647b: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area after a terminal resize. Ink's resize path only re-lays-out the yoga tree without re-rendering React components, and `useBoxMetrics` only fires when the element's own relative metrics change — an element inside a fixed-width, centered row (e.g. a main-menu button) keeps identical relative metrics on resize while its absolute position moves, so the component never re-rendered and the engine kept the pre-resize rect (no hover/click on the new position, the old position still hit, until a mouse hit on the stale area re-rendered the component). The hook now subscribes to terminal resize unconditionally (`useWindowSize`), forcing a re-render and re-registering the rect against the fresh layout.
  - **breaking**(`ink-cartridge`): mouse-region identity renamed `elementId` → `regionId` across the API — `MouseRegionEntry.elementId`, `KeyboardEngine#unregisterMouseRegion(layerId, regionId)`, `KeyboardEngine#getHoveredMouseRegion()` returning `{ layerId, regionId }`, and `useMouseRegion` options. The old name was misleading: it suggested the id of a keyboard layer element, but regions are independent of keyboard elements. Related behavior change: `useMouseRegion` now defaults to an **auto-generated unique id** per call site instead of inheriting the surrounding layer/modal element id — reusing that id made every region in the same layer/modal collide (later registrations overwrote earlier ones, e.g. only the last language row in a picker modal was clickable). Pass `regionId` explicitly to control identity. The engine's `hitLayer` no longer gates regions on the layer's `activeElements` (a keyboard concept); a region is hit-tested whenever its layer participates in the hit order.
  - **feat**(`blots-editor`): the settings screen now opens a centered language-picker modal (white bold border, filled background) instead of spreading the language options inline — Settings → Language → picker. Keyboard and mouse both work; the mouse-click fix above (unique per-region ids) is what makes every language row clickable.
  - **fix**(`blots-editor`): the main-menu button row benefits from the core fix above — mouse hit areas realign immediately after a terminal resize.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-resize.test.tsx` gains a fixed-width centered-row layout case (mirroring the main-menu buttons) covering the "absolute position moves while own relative metrics stay fixed" scenario — it fails with the fix removed and passes with it in place; `packages/editor/tests/settings.test.tsx` updated for the modal picker flow (open / select / Esc-cancel).

## 2.1.3

### Patch Changes

- 3011db8: ## ink-cartridge (framework)

  ### Minor / Feature

  - **feat**: `useMouseRegion` gains an `onWheel` callback — wheel events (`wheel-up` / `wheel-down` / `wheel-left` / `wheel-right`) fire when they hit a region, sharing the same hit-test priority chain as `onClick` (modal → layer → root)

  - **feat**: `KeyboardEngine` mouse support completed — `processMouseEvent` now dispatches `wheel` events (previously silently dropped); `MouseRegionService` gains `processWheel`

  ### Patch / Fix

  - **fix**: `KeyboardProvider` mouse subscription now includes `wheel` — previously only `click/move/press/drag/release` were subscribed, so wheel events died at the provider (symptom: clicks worked, wheel did nothing at all)

  - **fix**: Mouse escape sequences no longer pollute the keyboard stream — new `MouseReportFilter` intercepts SGR mouse reports (which Ink hands over as text like `[<0;20;5M` after stripping the ESC prefix) so they never reach the `useInput` keyboard pipeline (previously an editor would print mouse move/click garbage into the document)

  ### Docs

  - **docs**: engine docs gain `API/mouse-region.md` (full API for `registerMouseRegion` / `unregisterMouseRegion` / `processMouseEvent` / `getHoveredMouseRegion`, incl. wheel and the coordinate model); `API/README.md` naming table synced

  - **docs**: `KeyboardEngine-API.md` gains a Mouse Methods section; `react-ink.md` and `standalone.md` gain mouse integration sections; `docs/README.md` index points to the engine docs; `useMouseRegion-API.md`, `KeyboardProvider-API.md`, and `keyboard/README.md` document `onWheel` and the sequence-filtering behavior

  ***

  ## blots-editor (packages/editor)

  ### Breaking / Refactor (P0 foundation)

  - **refactor**: core model rewritten — `TextCalculation` removed, split into a pure-TS core `core/document/` (`position` / `text-line` / `document` / `operations`) plus a coordinator `core/editor-controller`

  - **feat**: command-driven architecture — `editor-controller` command registry + `execute(cmd)`; the keymap layer only translates keys → commands, paving the way for vim modes to be layered on with zero core changes

  - **feat**: dual-column coordinates (`logical` / `visual`) — editing uses code units, display and cross-line movement use terminal columns, fixing cursor drift on CJK/emoji

  - **feat**: every atomic operation carries its own `invert` — each edit (insert / delete / split / join / indent) can be replayed in reverse, laying the groundwork for P1 undo/redo

  - **fix**: `delete` key semantics corrected — the old prototype treated `delete` as `backspace`; now split by correct semantics (delete before the cursor / after the cursor, incl. cross-line joins)

  ### Feature (mouse)

  - **feat**: mouse click positions the cursor — new `view/click-mapping.ts` coordinate conversion + `Document.setCursorAtVisual` + `cursor.setPosition` command; gutter clicks clamp to the text's left edge, wide chars snap left, scroll offset handled

  - **feat**: mouse wheel scrolling — `onWheel` → `cursor.pageUp/pageDown` (one line per notch, cursor follows); `KeyboardProvider` enables `mouse`

  ### Test / Chore

  - **test**: 47 new tests — `document.test.ts` (18), `operations.test.ts` (23), `click-mapping.test.ts` (4), etc., covering wide-char cursors, visual-column preservation, invert restoration, and scroll boundaries

  - **chore**: directory structure aligned with the plan — `src/core/text` and `src/core/view` migrated to `src/core/document` + `src/view`

## 2.1.2

### Patch Changes

- ac36212: fix: Fixed an issue in the VS Code integrated terminal where rapidly pressing the left and right mouse buttons consecutively would prevent subsequent clicks from working correctly (implemented a fallback strategy).

## 2.1.1

### Patch Changes

- cd29d4d: chore: Make the component monorepo

## 2.1.0

### Minor Changes

- faf1002: Features: Supports basic mouse bindings.

## 2.0.0

### Major Changes

- 5f880ba: Disruptive Refactoring: Completely transforming the keyboard and screen systems into layer-based systems.
