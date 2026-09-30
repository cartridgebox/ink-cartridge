---
"ink-cartridge": minor
---

### Added
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
