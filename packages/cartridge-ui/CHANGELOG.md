# @cartridge-engine/ui

## 1.0.2

### Patch Changes

- 4f6641d: Upgrade to Ink v8 and React 19.3.

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

- Updated dependencies [4f6641d]
  - ink-cartridge@5.5.1

## 1.0.1

### Patch Changes

- fa92ccb: - **docs**(readme): point the API-doc links at the cartridgebox.art domain — the repo moved to the cartridgebox org and Pages now serves the custom domain, so every `baigaoa.github.io/ink-cartridge` URL returned 404.
- Updated dependencies [fa92ccb]
- Updated dependencies [ba69e11]
  - ink-cartridge@5.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [44dfa6a]
  - ink-cartridge@5.3.0
