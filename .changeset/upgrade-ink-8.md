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
- Support Ink v8: bump the `ink` devDependency to `^8.0.0` and `react` / `@types/react` to `^19.3.0`. The `ink` and `react` peer ranges are left unchanged (`ink >=5`, `react >=18`); only Ink 8 / React 19.3 are exercised in CI, so compatibility with older versions is best-effort rather than CI-verified.
- `@cartridge-engine/init` now scaffolds new projects with `ink ^8.0.0` and `react ^19.3.0`.

### Fixed
None

### Breaking Changes
None

### Tests
- `tests/keyboard/ink8-input-delivery.test.tsx` pins the Ink 8 input path: plain keypresses and an arrow-key escape sequence still reach `boundKeyboard` handlers, while SGR mouse reports are not handed to the pipeline. The arrow-key case is a control proving escape sequences reach `useInput` at all, so the mouse-report case is not vacuous.
