---
"blots-editor": patch
---
Adopt the renamed composition option and the lower-case Shift+letter key name.

### Added
None

### Changed
- Count-prefixed commands set `SwallowKeyWhenChainInterrupted` instead of the removed `KeyReleaseWhenChainInterrupted`, so the motion key after a count still ends the chain without also firing its plain binding.

### Fixed
- `G` binds as `shift+g` instead of the accidental upper-case `shift+G`, so it reaches the end of the document again after the keyboard adapter began lower-casing the character part of modifier variants.

### Breaking Changes
None

### Tests
None
