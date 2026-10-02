---
"blots-editor": patch
---
Add editor undo/redo with a configurable merge window.

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
