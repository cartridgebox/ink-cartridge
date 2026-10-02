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
- Extracted a generic `Slider` from the wheel-sensitivity bar; the new merge-window picker reuses it instead of duplicating the control.

### Fixed
- `JoinLineOp` no longer corrupts the document when undone after a no-op join (cursor on the last line) — its `invert` mirrors the no-op instead of splitting the line.

### Breaking Changes
None

### Tests
- `history.test.ts` covers undo/redo, cursor restore after a move, redo invalidation, the stack limit, opening a file clearing history, and coalescing (window boundaries, `0` disabling it, and cursor moves breaking a run).
- `settings-store.test.ts` covers merge-window validation (range, step, default) and persistence.
