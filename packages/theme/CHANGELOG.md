# @cartridge-engine/theme

## 1.0.1

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

## 1.0.0

### Major Changes

- 1531d6c: - **fix**(screen): `skip()` to the current screen now works, making `onlyAttribute` functional. Passing `{ onlyAttribute: true }` refreshes the current screen's props without remounting it (internal state and mouse regionFocus survive); the default remounts it with the new props. Previously the target was always rejected as "not a child", so the option was dead code.
  - **breaking**(packages): the i18n, theme, event, and init subsystems moved out of core into standalone `@cartridge-engine/i18n` / `@cartridge-engine/theme` / `@cartridge-engine/event` / `@cartridge-engine/init` packages. `ink-cartridge` no longer re-exports them — import from the new packages on demand. The single `ink-cartridge` CLI is replaced by per-command bins: `make-language-type`, `make-theme-type`, `init-theme`, `ink-cartridge-init`.
