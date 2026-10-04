---
"ink-cartridge": major
"@cartridge-engine/keyboard-engine": major
---
Return boolean from focus mutators and action/processor registration instead of throwing.

### Added
None

### Changed
- `focusUnregister(focusId, groupOrOptions?)` now returns `true` when a focus target was actually removed and `false` on any no-op path — no active owner, unresolved layer, or unknown group/target. Previously it returned `void`, so callers could not distinguish a real removal from a silent miss.
- `focusSet`, `focusNext`, and `focusPrev` now return `boolean` — `true` when the active focus changed, `false` on any no-op path (no owner, unresolved layer, unknown group, target not found, the target is already active, or the group holds fewer than two targets) — instead of throwing. The focus-mutator family is now consistent with `activateFocusGroup` / `kickFocusGroup`.
- `addAction` and `addSequenceAction` return `boolean` (false on a duplicate id); `removeAction` and `removeSequenceAction` return `boolean` (false when not registered); `modifyAction` and `modifySequenceAction` return `boolean` (false when the action is missing, has no preset keys, or has no default timeout). This matches `addCondition` / `removeCondition` / `removeProcessor`.
- `addProcessor` returns `false` on a duplicate id or a missing `before`/`after` target; an out-of-range `index` still throws.
- `defineShortcutAction` and `defineSequenceAction` are now atomic and return `boolean`: if any id already exists, or repeats within the batch, nothing is registered and `false` is returned instead of throwing part-way and leaving partial state.

### Fixed
None

### Breaking Changes
- The focus mutators (`focusSet`, `focusNext`, `focusPrev`) and the action/sequence CRUD (`addAction`, `addSequenceAction`, `removeAction`, `removeSequenceAction`, `modifyAction`, `modifySequenceAction`) no longer throw on a duplicate or missing id; code that caught these errors must check the boolean return value instead.
- `addProcessor` no longer throws on a duplicate id or a missing `before`/`after` target; it returns `false`. An out-of-range `index` still throws.
- `defineShortcutAction` / `defineSequenceAction` no longer throw on a duplicate id; they return `false` and register nothing (previously they threw part-way, leaving earlier entries registered).
- The exported helpers `setIfAbsent`, `deleteIfPresent`, and `modifyEntryKeys` no longer throw and dropped their trailing error-message parameters: `setIfAbsent` / `deleteIfPresent` now return `boolean`, `modifyEntryKeys` returns `T | undefined`.

### Tests
- Added `true`/`false` assertions for `focusUnregister` on default and grouped targets and its no-op paths.
- Updated the keyboard-engine `engine` and `LayerManager` base tests to assert the `true`/`false` contract of the focus mutators, action/sequence CRUD, and `addProcessor`; added tests for atomic `defineShortcutAction` batches, single-target focus groups (no false "moved"), and `modifySequenceAction` leaving preset keys untouched on a failed timeout; rewrote the `setIfAbsent` / `deleteIfPresent` / `modifyEntryKeys` unit test.
