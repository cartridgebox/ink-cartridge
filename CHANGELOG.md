# ink-cartridge

## 6.0.0

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

### Patch Changes

- Updated dependencies [40a88af]
  - @cartridge-engine/keyboard-engine@3.0.0

## 5.5.1

### Patch Changes

- 4f6641d: Upgrade to Ink v8 and React 19.3.

  ### Added

  None

  ### Changed

  - Support Ink v8: bump the `ink` devDependency to `^8.0.0` and `react` / `@types/react` to `^19.3.0`. The `ink` and `react` peer ranges are left unchanged (`ink >=5`, `react >=18`); only Ink 8 / React 19.3 are exercised in CI, so compatibility with older versions is best-effort rather than CI-verified.
  - `@cartridge-engine/init` now scaffolds new projects with `ink ^8.0.0` and `react ^19.3.0`.

  ### Fixed

  None

  ### Breaking Changes

  None

  ### Tests

  - `tests/keyboard/ink8-input-delivery.test.tsx` pins the Ink 8 input path: plain keypresses and an arrow-key escape sequence still reach `boundKeyboard` handlers, while SGR mouse reports are not handed to the pipeline. The arrow-key case is a control proving escape sequences reach `useInput` at all, so the mouse-report case is not vacuous.

## 5.5.0

### Minor Changes

- 9dae4df: ### Added

  - Module-level keyboard API: processor operations (`addProcessor`, `removeProcessor`, `getProcessors`, `resetProcessors`, `kickProcessor`, `activeProcessor`, `setProcessorWeight`) are callable outside React, without `useKeyboard`.
  - The same flat access covers shortcut/sequence actions, modes, conditions, composition, key mapping, global keys, and mouse-region registration.
  - `getEngine()` returns the mounted engine for manual use; `withOwner(owner, fn)` brackets an owner-scoped call like `getEngine().boundKeyboard(…)`.
  - `KeyboardProvider` gains an `engine` prop to inject a pre-built engine.

  ### Changed

  - `KeyboardProvider` registers its engine during render, so module-level calls also resolve from a child's effects.

  ### Fixed

  None

  ### Breaking Changes

  None

  ### Tests

  - Added `tests/keyboard/module-api.test.tsx` covering module-level forwarding, `withOwner` scoping, and render-time registration.

## 5.4.0

### Minor Changes

- ba69e11: - **feat**(composition): add a `cancelled` mapping-key event so subscribers can clear a "waiting for the next key" state when a mapping sequence is dropped by its timeout, by `abort()`, or by `undo()`. A timeout was previously silent, making it indistinguishable from a sequence still in progress.
  - **fix**(composition): record a mapped target chain in the undo history, one entry per target key, exactly as if the user had typed those keys. A chain that fired through `addMapping` used to be un-undoable, so `undo` behaved differently depending on how the same keys were triggered.
  - **fix**(composition): cancel a pending mapping sequence in `abort()`. A half-typed prefix stayed armed, so `g` → Escape → `h` still fired the `g h` mapping after the abort.
  - **fix**(composition): clear the recorded history after buffering it, so a chain is never recorded twice. Calling `abort()` after a chain had already completed on timeout duplicated the entry, and `undo` then replayed its `undoAction` more than once.
  - **fix**(composition): honour the `timeout` declared on a mapping entry. It was silently replaced by the engine-wide default, so a tighter timeout never took effect and a slower key sequence still matched.
  - **fix**(composition): drop a partial chain rejected by a `when` condition without recording it, matching how a broken match or a failed value guard behaves. A chain is only undoable once it reaches a terminal state (timeout, end key, `execute` returning `null`, or an explicit abort).

### Patch Changes

- fa92ccb: - **docs**(readme): point the API-doc links at the cartridgebox.art domain — the repo moved to the cartridgebox org and Pages now serves the custom domain, so every `baigaoa.github.io/ink-cartridge` URL returned 404.
- Updated dependencies [fa92ccb]
- Updated dependencies [ba69e11]
  - @cartridge-engine/keyboard-engine@2.2.0

## 5.3.5

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
- Updated dependencies [6a35637]
  - @cartridge-engine/keyboard-engine@2.1.13

## 5.3.4

### Patch Changes

- b775a34: - **feat**(keyboard-engine): pipeline processors are now ordered by `weight` — higher runs first, equal weights keep registration order via the engine-stamped `createAt`. The nine built-in stages carry default weights exported as `builtinProcessorWeights` (`modal` 8000 → `screen-stack` 0). `addProcessor` accepts an explicit `{ weight }`, or positions by `index` / `before` / `after` as sugar resolved to the weight of the targeted slot; without options a processor defaults to weight 0 (after all built-in stages).
  - **feat**(keyboard-engine): new `setProcessorWeight(id, weight)` re-assigns a processor's weight at runtime and immediately re-sorts the pipeline, so applications can reorder stages without removing and re-adding them. It is also exposed through `useKeyboard()` on the React adapter.
  - **refactor**(keyboard-engine): kicking/activating now toggles each processor's `active` flag — inactive stages are skipped before `process()` runs and the `noActiveProcessor` list is removed. `addProcessor` now accepts the leaner `ProcessorInput` (`id` + `process`, optional `active`); `weight` and `createAt` are injected by the engine to build the full `PipelineProcessor`.
  - **breaking**(keyboard-engine): removed the `BuiltinProcessorId` union type and the `_insertRelative` export, and processor factories (`createModalProcessor`, `createCompositionProcessor`, …) now return `ProcessorInput` — weight ordering supersedes fixed-position insertion.
  - **feat**(ink-cartridge): re-export `builtinProcessorWeights` and the `ProcessorInput` type from the framework root.
  - **test**(keyboard-engine): add coverage for weight ordering, equal-weight registration ties, engine-stamped processor fields, inactive-processor skipping, and runtime re-weighting.
- Updated dependencies [b775a34]
  - @cartridge-engine/keyboard-engine@2.1.12

## 5.3.3

### Patch Changes

- 5dbe670: - **fix**(keyboard): `boundKeyboard(actionId, options?)` no longer crashes when called with only the action id — the React hook's action-id overload read `handlerOrOptions.ref` / `handlerOrOptions.focusId` without optional chaining, throwing `Cannot read properties of undefined (reading 'ref')` on single-argument calls. The branch now guards the options object the same way `boundSequence`'s overload does.

## 5.3.2

### Patch Changes

- 64c9985: - **fix**(keyboard-engine): correct misspelled public type names — `CompositioKey` is now `CompositionKey`, `CompositionPneding` is now `CompositionPending`, and the `TComponet` generic parameter on `CompositionKey`/`MappingKeyEntry`/`PrimitiveTypeKeys` is now `TComponent`
  - **fix**(ink-cartridge): re-export the corrected `CompositionKey` type
- Updated dependencies [64c9985]
  - @cartridge-engine/keyboard-engine@2.1.11

## 5.3.1

### Patch Changes

- 45b7f67: - **feat**(screen): `registerComponent` template is now optional and defaults to `{}` when omitted
  - **feat**(screen): `skip`/`gotoScreen` params are now optional when the target screen declares no required props, so `skip(Child)` compiles for prop-less screens while required props still demand params

## 5.3.0

### Minor Changes

- 44dfa6a: - **feat**(`ink-cartridge`): add `bringLayerToFront` and `restoreLayerZIndex` — raise a regular layer to the top of the stack (zIndex = max + 1) or restore a raised layer to the zIndex it was opened with. Reordering replaces the layer via spread, so `elements` / `regionFocus` / `hostPage` references survive and element components never remount.
  - **feat**(`ink-cartridge`): `useMouseRegion` gains raise triggers — `clickOnRise`, `dragOnRise`, `wheelOnRise`, and `enterOnRise` raise the surrounding regular layer before the user's own callback runs, and `leaveOffRise` restores it on hover leave (only applies with `enterOnRise`; defaults `true`). Ineffective on modal layers and outside any layer.
  - **fix**(`ink-cartridge`): layer reorders forced every layer element's binding effect to re-bind against the owner stack's top (the last-mounted sibling), silently moving bindings into a ghost element slot that the pipeline never visits. `useKeyboard` now temporarily declares its own owner for every binding and focus call, so keyboard ownership follows the current layer order across raises, restores, and other layer mutations.
  - **fix**(`ink-cartridge`): `MouseRegionOptions` was value-exported from `src/keyboard/index.ts`, crashing module loading when running sources directly with `npx tsx`.
  - **test**(`ink-cartridge`): `tests/screens/base/bringToFront.test.tsx` covers raise/restore reducer behavior (ordering, reference preservation, top-layer and unknown-ID no-ops, modal isolation); `tests/keyboard/click-rise.test.tsx` covers click-triggered raising and keyboard routing; `tests/keyboard/owner-rebind.test.tsx` pins rebind ownership; `tests/keyboard/rise-restore.test.tsx` pins keyboard ownership across raise/restore round trips.

## 5.2.2

### Patch Changes

- 0447961: - **feat**(keyboard): `useMouseRegion` gains a `ref` option — the region registers under an external object ref instead of a hook-created one, so a wrapper component can share the same ref with `boundKeyboard({ ref, focusId })` and clicks forward keyboard focus to that binding
  - **feat**(keyboard): export `MouseRegionCallbacks` from the framework root

## 5.2.1

### Patch Changes

- 1531d6c: - **fix**(screen): `skip()` to the current screen now works, making `onlyAttribute` functional. Passing `{ onlyAttribute: true }` refreshes the current screen's props without remounting it (internal state and mouse regionFocus survive); the default remounts it with the new props. Previously the target was always rejected as "not a child", so the option was dead code.
  - **breaking**(packages): the i18n, theme, event, and init subsystems moved out of core into standalone `@cartridge-engine/i18n` / `@cartridge-engine/theme` / `@cartridge-engine/event` / `@cartridge-engine/init` packages. `ink-cartridge` no longer re-exports them — import from the new packages on demand. The single `ink-cartridge` CLI is replaced by per-command bins: `make-language-type`, `make-theme-type`, `init-theme`, `ink-cartridge-init`.

## 5.2.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [2ad5ef2]
  - @cartridge-engine/keyboard-engine@2.1.7

## 5.1.8

### Patch Changes

- 02c8bc5: - **feat**(`ink-cartridge`): `automaticTakeoverKeyboard` now also accepts a page list (`ComponentType<any>[]`) alongside `boolean`. With a list, the layer's keyboard bindings stay active on every unlisted page and go dormant only while the current page is one of the listed pages — the list wins even when it contains the layer's host page — and they reactivate when leaving a listed page. `true` keeps the previous behavior (bindings active only on the host page); the same scoping applies to normal and modal layers via `openLayer` / `openModalLayer` options.
  - **test**(`ink-cartridge`): `tests/keyboard/persistent-layer.test.tsx` covers the array scoping — multi-page lists, listing the host page, `gotoScreen` jumps, and scoped modal layers.

## 5.1.7

### Patch Changes

- d129474: - **feat**(`blots-editor`): the floating toolbar is now draggable — press and drag any tool button to move the bar, clamped so it never leaves the terminal view. The buttons forward drag events to the bar because the engine captures a drag on the pressed region only; clicking (without movement) still fires the tool's action.
  - **fix**(`blots-editor`): opening the toolbar layer no longer throws `Navigation function called before Provider is mounted` when the editor is the initial screen. Passive effects run child-first on mount, so the layer open is deferred one tick until the `ScenarioManagementProvider` has registered its dispatcher.
  - **docs**(`ink-cartridge`): all comments rewritten and completed — Chinese comments translated to English, decorative separator comments removed, and every public symbol now has a detailed English JSDoc (typedoc's `notDocumented` validation reports zero gaps), with `@example` blocks added to the key hooks, providers, and layer functions. API documentation is now generated by typedoc into the root `documents/` directory (`npm run docs`) and auto-published to GitHub Pages on every push to `main`; the hand-written `docs/` tree was removed.
  - **docs**(`@cartridge-engine/keyboard-engine`): the same comment overhaul — including rewriting the previously machine-translated comments in `CompositionEngine.ts` — plus detailed JSDoc migrated from the deleted hand-written API reference (pipeline ordering, binding option semantics, drag lifecycle, focus/composition/mapping rules). Twenty-five new named types were extracted purely for documentation (`FocusRef`, the eight `Composition*Event` variants, the five `MappingKey*Event` variants, `FocusResult`, `FocusCurrentResult`, `HoveredRegion`, `MousePosition`, `MouseStreamEvent`, `ModalMissHandledEvent`, `ModalMissUnhandledEvent`, `FocusTargetsMap`, `CurrentFocusId`, `EntryWithOptionalKeys`, `FlagTransition`) — additive type exports only, no runtime or shape changes.
- Updated dependencies [d129474]
  - @cartridge-engine/keyboard-engine@2.1.6

## 5.1.6

### Patch Changes

- f883b98: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area when an element's **absolute position** changes while its own relative layout stays fixed — e.g. a child control inside a draggable modal frame. The rect was previously re-measured only during render, so after dragging a modal frame the frame re-registered its new rect while the overlapping children (sensitivity bar, language rows) kept the pre-move rect: a press on the bar hit the frame instead, and the frame followed the cursor. The hook now subscribes to Ink's root layout listeners (the same `internal_layoutListeners` set `useBoxMetrics` uses) and re-measures unconditionally after every layout commit, so region rects follow ancestor moves even when the component never re-renders — which React's children bailout (unchanged element reference) and `useBoxMetrics` (own relative metrics only) both previously prevented.
  - **fix**(`blots-editor`): dragging the language / sensitivity modal frame no longer breaks the controls inside it — after moving the frame once, pressing and dragging the sensitivity bar (or clicking a language row) hits the control instead of re-dragging the frame.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-ancestor-move.test.tsx` reproduces the reported scenario — an absolutely-positioned draggable frame with an overlapping child region. It fails with the fix removed (a click at the child's new position lands on the frame) and passes with it in place.
- Updated dependencies [f883b98]
  - @cartridge-engine/keyboard-engine@2.1.5

## 5.1.5

### Patch Changes

- b130db8: - **feat**(`blots-editor`): soft-wrap long lines at the editable width minus one cell (right-edge margin). The document gains a visual-line model (`visualLineCount` / `visualLineAt` / `setWrapWidth`) layered over the logical lines: line numbers render only on each logical line's first segment, the cursor moves by visual lines keeping its horizontal offset (clamping to the segment end only when the target visual line is narrower), scroll/paging work in visual-line terms, and mouse clicks on wrapped continuations land on the right logical position. Rendering is driven by `useBoxMetrics` width, so resizing re-wraps live.
  - **feat**(`blots-editor`): rainbow-gradient logo ("Blots Editor") generated with the same stack as `oh-my-logo --filled` (cfonts block glyphs + gradient-string palette, truecolor via `chalk.level`), rendered as plain ANSI text so it embeds in Ink. The logo is responsive: wide terminals show the words side by side; narrow terminals stack them, and as the terminal height shrinks the font steps down (block → simple → chrome → tiny) so the menu buttons stay visible.
  - **feat**(`blots-editor`): Ctrl+wheel scrolls the view without moving the cursor, clamped to the document range; the view stays put until the cursor moves again (arrow keys / click / plain wheel). Plain wheel keeps its existing behavior of actually moving the cursor one visual line per notch.
  - **deps**(`blots-editor`): adds `cfonts`, `chalk`, `gradient-string`, `oh-my-logo` (runtime) and `@types/gradient-string` (dev).

## 5.1.4

### Patch Changes

- c56647b: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area after a terminal resize. Ink's resize path only re-lays-out the yoga tree without re-rendering React components, and `useBoxMetrics` only fires when the element's own relative metrics change — an element inside a fixed-width, centered row (e.g. a main-menu button) keeps identical relative metrics on resize while its absolute position moves, so the component never re-rendered and the engine kept the pre-resize rect (no hover/click on the new position, the old position still hit, until a mouse hit on the stale area re-rendered the component). The hook now subscribes to terminal resize unconditionally (`useWindowSize`), forcing a re-render and re-registering the rect against the fresh layout.
  - **breaking**(`ink-cartridge`): mouse-region identity renamed `elementId` → `regionId` across the API — `MouseRegionEntry.elementId`, `KeyboardEngine#unregisterMouseRegion(layerId, regionId)`, `KeyboardEngine#getHoveredMouseRegion()` returning `{ layerId, regionId }`, and `useMouseRegion` options. The old name was misleading: it suggested the id of a keyboard layer element, but regions are independent of keyboard elements. Related behavior change: `useMouseRegion` now defaults to an **auto-generated unique id** per call site instead of inheriting the surrounding layer/modal element id — reusing that id made every region in the same layer/modal collide (later registrations overwrote earlier ones, e.g. only the last language row in a picker modal was clickable). Pass `regionId` explicitly to control identity. The engine's `hitLayer` no longer gates regions on the layer's `activeElements` (a keyboard concept); a region is hit-tested whenever its layer participates in the hit order.
  - **feat**(`blots-editor`): the settings screen now opens a centered language-picker modal (white bold border, filled background) instead of spreading the language options inline — Settings → Language → picker. Keyboard and mouse both work; the mouse-click fix above (unique per-region ids) is what makes every language row clickable.
  - **fix**(`blots-editor`): the main-menu button row benefits from the core fix above — mouse hit areas realign immediately after a terminal resize.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-resize.test.tsx` gains a fixed-width centered-row layout case (mirroring the main-menu buttons) covering the "absolute position moves while own relative metrics stay fixed" scenario — it fails with the fix removed and passes with it in place; `packages/editor/tests/settings.test.tsx` updated for the modal picker flow (open / select / Esc-cancel).
- Updated dependencies [c56647b]
  - @cartridge-engine/keyboard-engine@2.1.4

## 5.1.3

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

- Updated dependencies [3011db8]
  - @cartridge-engine/keyboard-engine@2.1.3

## 5.1.2

### Patch Changes

- ac36212: fix: Fixed an issue in the VS Code integrated terminal where rapidly pressing the left and right mouse buttons consecutively would prevent subsequent clicks from working correctly (implemented a fallback strategy).
- Updated dependencies [ac36212]
  - @cartridge-engine/keyboard-engine@2.1.2

## 5.1.1

### Patch Changes

- cd29d4d: chore: Make the component monorepo
- Updated dependencies [cd29d4d]
  - @cartridge-engine/keyboard-engine@2.1.1

## 5.1.0

### Minor Changes

- faf1002: Features: Supports basic mouse bindings.

### Patch Changes

- Updated dependencies [faf1002]
  - @cartridge-engine/keyboard-engine@2.1.0

## 5.0.1

### Patch Changes

- 5bf60e2: feat: Intelligent persistence of model layers and layers, optimization of ordinary layers to avoid error crash

## 5.0.0

### Major Changes

- 5f880ba: Disruptive Refactoring: Completely transforming the keyboard and screen systems into layer-based systems.

### Patch Changes

- Updated dependencies [5f880ba]
  - @cartridge-engine/keyboard-engine@2.0.0

## 4.4.2

### Patch Changes

- 03d4061: fix: Fixing incorrect documentation issues

## 4.4.1

### Patch Changes

- 43dcfe5: fix: Fixed an issue where you couldn't tell a single key from a key with a modifier.
