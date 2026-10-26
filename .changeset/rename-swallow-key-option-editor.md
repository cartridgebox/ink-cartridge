---
"blots-editor": patch
---
Adopt the renamed composition option.

### Added
None

### Changed
- Count-prefixed commands set `SwallowKeyWhenChainInterrupted` instead of the removed `KeyReleaseWhenChainInterrupted`, so the motion key after a count still ends the chain without also firing its plain binding.

### Fixed
None

### Breaking Changes
None

### Tests
None
