---
"blots-editor": patch
---
Add keyboard focus switching between the editor and the file tree, and make the render rate configurable.

### Added
- Normal-mode `Tab` toggles keyboard focus between the editor pane and the file tree pane, so the tree can be driven without the mouse.
- A "Render Rate (FPS)" setting (5–120 fps, step 5, default 30) that sets Ink's `maxFps` render throttle.

### Changed
- The file tree supports keyboard navigation while focused: arrows / `j` `k` move the selection, `Enter` opens a file or expands a directory, `h` `l` collapse/expand, and `Esc` returns focus to the editor. The focused pane is highlighted.
- The render rate is no longer hard-coded to 120 fps; it comes from the setting and takes effect on the next launch (Ink reads `maxFps` once, at render construction).

### Fixed
None

### Breaking Changes
None

### Tests
- `packages/editor/tests/file-tree-focus.test.tsx` covers focus switching, focus-gated tree navigation, file opening, and directory expansion.
- `packages/editor/tests/settings-store.test.ts` covers the fps schema (default, valid range, off-step/out-of-range fallback), and `packages/editor/tests/settings.test.tsx` covers the fps picker.
