---
"blots-editor": patch
---
Add keyboard focus switching between the editor and the file tree.

### Added
- Normal-mode `Tab` toggles keyboard focus between the editor pane and the file tree pane, so the tree can be driven without the mouse.

### Changed
- The file tree supports keyboard navigation while focused: arrows / `j` `k` move the selection, `Enter` opens a file or expands a directory, `h` `l` collapse/expand, and `Esc` returns focus to the editor. The focused pane is highlighted.

### Fixed
None

### Breaking Changes
None

### Tests
- `packages/editor/tests/file-tree-focus.test.tsx` covers focus switching, focus-gated tree navigation, file opening, and directory expansion.
