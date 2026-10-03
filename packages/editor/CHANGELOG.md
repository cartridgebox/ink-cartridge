# blots-editor

## 0.0.19

### Patch Changes

- b540b2a: Add keyboard focus switching between the editor and the file tree, and make the render rate configurable.

  ### Added

  - Normal-mode `Tab` toggles keyboard focus between the editor pane and the file tree; clicking either pane focuses it, in any mode. Both panes share one focus group, so only one receives keys at a time — no mode switch is needed.
  - A "Render Rate (FPS)" setting (5–120 fps, step 5, default 30) that sets Ink's `maxFps` render throttle.

  ### Changed

  - The file tree supports keyboard navigation while focused: arrows / `j` `k` move the selection, `Enter` opens a file or expands a directory, `h` `l` collapse/expand, and `Esc` returns focus to the editor. The focused pane is highlighted.

  ### Fixed

  None

  ### Breaking Changes

  None

  ### Tests

  - `packages/editor/tests/file-tree-focus.test.tsx` covers focus switching, focus-gated tree navigation, file opening, and directory expansion.
  - `packages/editor/tests/settings-store.test.ts` covers the fps schema (default, valid range, off-step/out-of-range fallback), and `packages/editor/tests/settings.test.tsx` covers the fps picker.

## 0.0.18

### Patch Changes

- c595f59: Add editor undo/redo with a configurable merge window.

  ### Added

  - Undo/redo for the editor, backed by a `History` that records each edit's operation together with the cursor before and after it, so undo restores both the text and the caret even after the cursor has moved. Normal mode binds `u` (undo) and `Ctrl+R` (redo).
  - Undo coalescing: consecutive mergeable edits (adjacent typed characters) inside the merge window collapse into a single undo step, so a typed word undoes as a word.
  - New "Undo Merge Window" setting (0–2000 ms, 100 ms steps): edits landing closer together than the window share one step, and `0` disables coalescing so every edit stands alone. It persists alongside the other settings.

  ### Changed

  - Editing commands now route through `History`: `EditorController` handlers return an `EditOperation`, and the controller applies and records it in one place.
  - `EditOperation.apply` now reports whether it changed the document, so `History` can tell a real edit from a no-op one.
  - Extracted a generic `Slider` from the wheel-sensitivity bar; the new merge-window picker reuses it instead of duplicating the control.

  ### Fixed

  - `JoinLineOp` no longer corrupts the document when undone after a no-op join (cursor on the last line) — its `invert` mirrors the no-op instead of splitting the line.
  - No-op edits (backspace at the document start, outdent with no indentation, join on the last line) no longer record an undo step. Previously a single `u` consumed a dead step — undoing the previous real edit took two presses — and a burst of them could evict genuine history at the stack limit.
  - The wheel-sensitivity and merge-window sliders now render one cell per value (`steps + 1` cells spanning `min`..`max`), so a mouse click reaches every value, and the fill follows the value's own cell so it matches the click mapping. The old mapping left the top step (10× / 2000 ms) unreachable by mouse; dividing by the cell count instead skipped an interior one (5.5× / 1000 ms); and a proportional fill jumped two cells at the midpoint.

  ### Breaking Changes

  None

  ### Tests

  - `history.test.ts` covers undo/redo, cursor restore after a move, redo invalidation, the stack limit, opening a file clearing history, coalescing (window boundaries, `0` disabling it, and cursor moves breaking a run), that no-op inverts leave the document intact, and that a no-op edit records no undo step.
  - `settings-store.test.ts` covers merge-window validation (range, step, default) and persistence.
  - `sensitivity-bar.test.ts` covers the bar's cell mapping (the last cell selects the maximum, every value including interior ones is reachable, a single-value range collapses to `min`) and the fill mapping (aligned with the click mapping, one cell at `min`, full at `max`, clamped out of range).
  - `editor-mode.test.tsx` covers the settings-to-history wiring: the persisted merge window drives undo coalescing in the editor.

## 0.0.17

### Patch Changes

- 8aa97cc: - **feat**(`blots-editor`): `cursor.moveUp` and `cursor.moveDown` accept a `count`, so one command can travel several lines instead of being fired repeatedly. `Document.moveUp`/`moveDown` take the same optional argument (default 1) and clamp an overshoot to the first/last visual line. A `count` of 1 keeps the old behavior exactly, down to the move-to-segment-start when the cursor already sits on the first visual line.
  - **feat**(`blots-editor`): normal mode gains a Vim-style count prefix — digits accumulate inside a composition chain (`value = value * 10 + digit`) and the next vertical key (`j`, `k`, `up`, `down`) spends it, so `5j` moves five lines and `12k` twelve. `0` can only extend a count, never open one, so a bare `0` still means line-start (`10j` still works). Counts are normal-mode only; with no count armed a direction key falls straight through to its plain binding, so single-line movement keeps zero latency and insert mode is untouched.
  - **fix**(`blots-editor`): the file tree no longer reports "No directory" when the root is set to a custom path that is blank — it falls back to the startup directory, which is exactly the state the picker leaves behind when you switch to custom without typing a path. The unreachable `fileTree.noDir` message is gone from both language packs; a path that is set but unreadable still reports "Scan failed".
  - **test**(`blots-editor`): `document` and `editor-controller` cover the `count` argument, `editor-mode` drives the count prefix end-to-end (accumulation, clamping, bare `0`, insert-mode inertness), and `file-tree-model` asserts the blank-path fallback.

## 0.0.16

### Patch Changes

- 2471c3f: - **perf**(`blots-editor`): significantly faster editing and rendering for large files — soft-wrap segments are now cached per line (invalidated only by real edits or an actual wrap-width change, rebuilt lazily), and a prefix-sum index answers visual-line queries (`visualLineAt`, `cursorVisualLine`, `visualLineCount`) in O(log n)/O(1) instead of rescanning every line each frame. `setWrapWidth` no longer invalidates when the measured width is unchanged, so ordinary re-renders keep the cache intact.
  - **test**(`blots-editor`): `document-cache.test.ts` covers the new cache — edits and wrap-width changes invalidate it, unchanged re-queries reuse it, and prefix-sum visual-line mapping stays correct.

## 0.0.15

### Patch Changes

- a56d981: - Restore the floating toolbar's drag behavior: the bar starts bottom-center and follows the cursor with a grab offset, clamped to the terminal (below the information bar and left of the file tree when open)
  - Make file-tree scanning asynchronous: the pane shows "Scanning..." while the root is being read and "Scan failed" when the directory is unreadable
  - Localize the remaining file-tree strings ("Scanning...", "No directory", "Scan failed", "Unsaved changes") in the English and Chinese language packs
  - Reorganize editor sources into `core/io`, `view/page`, `view/editor`, `view/utils`, and `utils/view` modules
  - Update tests for the new module layout and async scan API, and isolate them from the user's real settings file

## 0.0.14

### Patch Changes

- 8b88f53: - **feat**(`blots-editor`): file tree — a VSCode-style pane pinned to the right edge of the editor (regular layer, bold border, editor background, not draggable, kept below the information bar and out of the toolbar's drag area). The root directory comes from a new setting (`FileTree Root`: startup directory or a custom path, `~` expanded), is scanned recursively (ignoring `node_modules`/`.git`/hidden entries and symlinks), and is cached after the first scan — later opens are instant; the `↻` button next to the pane title forces a re-scan. Directories expand/collapse on click (▸/▾ arrows follow the state), the pane sizes itself to its widest visible file name, and clicking a file opens it in the editor; with unsaved changes a Save / Discard / Cancel prompt appears first. The pane toggles via the toolbar's File Tree button and defaults to open.
  - **feat**(`blots-editor`): file open/save lifecycle — a shared file session drives the editor. Files load with CRLF normalized to LF; the dirty state is a sha256 comparison of the buffer against the last saved content (node `crypto`), shown as a `●` marker in the status bar. Saving happens via the toolbar's Save button, the `:save` command, or Ctrl+S in normal mode; results (Saved / error) appear in the status bar. The status bar also shows the open file name (`[untitled]` for the empty buffer).
  - **feat**(`blots-editor`): in-editor menu — the toolbar's Settings button opens a centered dialog (ModalFrame) with two buttons: Settings opens the settings panel as its own layer on top (same entries as the settings screen — language, wheel sensitivity, file tree root), Exit navigates back to the main menu. Dialogs share the editor background color and stay below the information bar (also when the terminal is resized).
  - **fix**(`blots-editor`): the toolbar can no longer be dragged over the file tree (the clamp follows the pane's live width) and is pushed aside when the pane opens; a shrunken terminal re-clamps the toolbar and dialogs back inside the viewport.
  - **fix**(`blots-editor`): files containing tabs no longer scramble the layout — tabs are expanded to spaces for rendering (tab-stop aware), so width math, Ink's layout, and the terminal paint agree; the buffer itself keeps the raw tabs.
  - **fix**(`blots-editor`): the toolbar's keyboard activation now uses bare Enter in normal mode instead of Ctrl+Enter — terminals send the same byte (`\r`) for both, so a ctrl-modified Enter can never reach the engine.

## 0.0.13

### Patch Changes

- d129474: - **feat**(`blots-editor`): the floating toolbar is now draggable — press and drag any tool button to move the bar, clamped so it never leaves the terminal view. The buttons forward drag events to the bar because the engine captures a drag on the pressed region only; clicking (without movement) still fires the tool's action.
  - **fix**(`blots-editor`): opening the toolbar layer no longer throws `Navigation function called before Provider is mounted` when the editor is the initial screen. Passive effects run child-first on mount, so the layer open is deferred one tick until the `ScenarioManagementProvider` has registered its dispatcher.
  - **docs**(`ink-cartridge`): all comments rewritten and completed — Chinese comments translated to English, decorative separator comments removed, and every public symbol now has a detailed English JSDoc (typedoc's `notDocumented` validation reports zero gaps), with `@example` blocks added to the key hooks, providers, and layer functions. API documentation is now generated by typedoc into the root `documents/` directory (`npm run docs`) and auto-published to GitHub Pages on every push to `main`; the hand-written `docs/` tree was removed.
  - **docs**(`@cartridge-engine/keyboard-engine`): the same comment overhaul — including rewriting the previously machine-translated comments in `CompositionEngine.ts` — plus detailed JSDoc migrated from the deleted hand-written API reference (pipeline ordering, binding option semantics, drag lifecycle, focus/composition/mapping rules). Twenty-five new named types were extracted purely for documentation (`FocusRef`, the eight `Composition*Event` variants, the five `MappingKey*Event` variants, `FocusResult`, `FocusCurrentResult`, `HoveredRegion`, `MousePosition`, `MouseStreamEvent`, `ModalMissHandledEvent`, `ModalMissUnhandledEvent`, `FocusTargetsMap`, `CurrentFocusId`, `EntryWithOptionalKeys`, `FlagTransition`) — additive type exports only, no runtime or shape changes.
- Updated dependencies [d129474]
  - ink-cartridge@5.1.7

## 0.0.12

### Patch Changes

- f883b98: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area when an element's **absolute position** changes while its own relative layout stays fixed — e.g. a child control inside a draggable modal frame. The rect was previously re-measured only during render, so after dragging a modal frame the frame re-registered its new rect while the overlapping children (sensitivity bar, language rows) kept the pre-move rect: a press on the bar hit the frame instead, and the frame followed the cursor. The hook now subscribes to Ink's root layout listeners (the same `internal_layoutListeners` set `useBoxMetrics` uses) and re-measures unconditionally after every layout commit, so region rects follow ancestor moves even when the component never re-renders — which React's children bailout (unchanged element reference) and `useBoxMetrics` (own relative metrics only) both previously prevented.
  - **fix**(`blots-editor`): dragging the language / sensitivity modal frame no longer breaks the controls inside it — after moving the frame once, pressing and dragging the sensitivity bar (or clicking a language row) hits the control instead of re-dragging the frame.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-ancestor-move.test.tsx` reproduces the reported scenario — an absolutely-positioned draggable frame with an overlapping child region. It fails with the fix removed (a click at the child's new position lands on the frame) and passes with it in place.
- Updated dependencies [f883b98]
  - ink-cartridge@5.1.6

## 0.0.11

### Patch Changes

- be9ea1d: - **fix**(`blots-editor`): backspace/delete no longer split an emoji's surrogate pair. Deleting at the edge of an emoji removes the whole glyph instead of leaving a broken half-rendering char, and `invert` (undo) restores the full code point.
  - **fix**(`blots-editor`): the cursor crosses an emoji in one left/right step instead of two, and any cursor placement that would land between the halves of a surrogate pair snaps to the pair start (enforced in `Document#setCursor`, the single choke point). Typing next to an emoji can no longer produce a split pair, and vertical moves onto a line containing an emoji keep snapping to the nearest valid position, never inside a pair.
  - **test**(`blots-editor`): adds roughly 80 tests for the pure text-editing core: `EditorController` (previously untested — command registry, change notifications, builtin edit/cursor/view commands, argument coercion), `TextLine` unit tests (width cache, surrogate pairs, soft-wrap segment edges), `Document` edge cases (line mutation, word movement, emoji-aware movement, soft-wrap cursor placement, scroll/page bounds), operations edge cases (empty-line joins/splits, indent/outdent variants, apply/invert round-trips via shared factories in `tests/base/_logic-helpers.ts`), and click-mapping boundary cases (gutter/wide-char/wrapped clicks).

## 0.0.10

### Patch Changes

- b130db8: - **feat**(`blots-editor`): soft-wrap long lines at the editable width minus one cell (right-edge margin). The document gains a visual-line model (`visualLineCount` / `visualLineAt` / `setWrapWidth`) layered over the logical lines: line numbers render only on each logical line's first segment, the cursor moves by visual lines keeping its horizontal offset (clamping to the segment end only when the target visual line is narrower), scroll/paging work in visual-line terms, and mouse clicks on wrapped continuations land on the right logical position. Rendering is driven by `useBoxMetrics` width, so resizing re-wraps live.
  - **feat**(`blots-editor`): rainbow-gradient logo ("Blots Editor") generated with the same stack as `oh-my-logo --filled` (cfonts block glyphs + gradient-string palette, truecolor via `chalk.level`), rendered as plain ANSI text so it embeds in Ink. The logo is responsive: wide terminals show the words side by side; narrow terminals stack them, and as the terminal height shrinks the font steps down (block → simple → chrome → tiny) so the menu buttons stay visible.
  - **feat**(`blots-editor`): Ctrl+wheel scrolls the view without moving the cursor, clamped to the document range; the view stays put until the cursor moves again (arrow keys / click / plain wheel). Plain wheel keeps its existing behavior of actually moving the cursor one visual line per notch.
  - **deps**(`blots-editor`): adds `cfonts`, `chalk`, `gradient-string`, `oh-my-logo` (runtime) and `@types/gradient-string` (dev).
- Updated dependencies [b130db8]
  - ink-cartridge@5.1.5

## 0.0.9

### Patch Changes

- c56647b: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area after a terminal resize. Ink's resize path only re-lays-out the yoga tree without re-rendering React components, and `useBoxMetrics` only fires when the element's own relative metrics change — an element inside a fixed-width, centered row (e.g. a main-menu button) keeps identical relative metrics on resize while its absolute position moves, so the component never re-rendered and the engine kept the pre-resize rect (no hover/click on the new position, the old position still hit, until a mouse hit on the stale area re-rendered the component). The hook now subscribes to terminal resize unconditionally (`useWindowSize`), forcing a re-render and re-registering the rect against the fresh layout.
  - **breaking**(`ink-cartridge`): mouse-region identity renamed `elementId` → `regionId` across the API — `MouseRegionEntry.elementId`, `KeyboardEngine#unregisterMouseRegion(layerId, regionId)`, `KeyboardEngine#getHoveredMouseRegion()` returning `{ layerId, regionId }`, and `useMouseRegion` options. The old name was misleading: it suggested the id of a keyboard layer element, but regions are independent of keyboard elements. Related behavior change: `useMouseRegion` now defaults to an **auto-generated unique id** per call site instead of inheriting the surrounding layer/modal element id — reusing that id made every region in the same layer/modal collide (later registrations overwrote earlier ones, e.g. only the last language row in a picker modal was clickable). Pass `regionId` explicitly to control identity. The engine's `hitLayer` no longer gates regions on the layer's `activeElements` (a keyboard concept); a region is hit-tested whenever its layer participates in the hit order.
  - **feat**(`blots-editor`): the settings screen now opens a centered language-picker modal (white bold border, filled background) instead of spreading the language options inline — Settings → Language → picker. Keyboard and mouse both work; the mouse-click fix above (unique per-region ids) is what makes every language row clickable.
  - **fix**(`blots-editor`): the main-menu button row benefits from the core fix above — mouse hit areas realign immediately after a terminal resize.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-resize.test.tsx` gains a fixed-width centered-row layout case (mirroring the main-menu buttons) covering the "absolute position moves while own relative metrics stay fixed" scenario — it fails with the fix removed and passes with it in place; `packages/editor/tests/settings.test.tsx` updated for the modal picker flow (open / select / Esc-cancel).
- Updated dependencies [c56647b]
  - ink-cartridge@5.1.4

## 0.0.8

### Patch Changes

- a635c04: ## blots-editor (packages/editor)

  ### Patch / Fix

  - **fix**: Add `#!/usr/bin/env node` shebang to the CLI entry — after a global install, the `blots-editor` command runs under Node correctly instead of being opened by the OS's `.js` file association (e.g. VS Code opening `dist/index.js` on Windows).

## 0.0.7

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
  - ink-cartridge@5.1.3

## 0.0.6

### Patch Changes

- 5f880ba: Disruptive Refactoring: Completely transforming the keyboard and screen systems into layer-based systems.
- Updated dependencies [5f880ba]
  - ink-cartridge@5.0.0

## 0.0.5

### Patch Changes

- c601978: fix: Fixed issues with cursor misalignment and rendering misalignment.

## 0.0.4

### Patch Changes

- 3f50758: feat: Adaptive line number
- 3f50758: fix: Fix for line number error display

## 0.0.3

### Patch Changes

- d597692: feat: Adaptive line number

## 0.0.2

### Patch Changes

- 1f82e98: chore: init the package
