---
"ink-cartridge": patch
"@cartridge-engine/ui": patch
"blots-editor": patch
"@cartridge-engine/event": patch
"@cartridge-engine/i18n": patch
"@cartridge-engine/theme": patch
"@cartridge-engine/init": patch
---

Upgrade to Ink v8 and React 19.3.

### Added
None

### Changed
- Support Ink v8: bump the `ink` devDependency to `^8.0.0` and `react` / `@types/react` to `^19.3.0`. The `ink` and `react` peer ranges are unchanged (`ink >=5`, `react >=18`), so existing installs keep working and older Ink versions remain supported.
- `@cartridge-engine/init` now scaffolds new projects with `ink ^8.0.0` and `react ^19.3.0`.

### Fixed
None

### Breaking Changes
None

### Tests
None
