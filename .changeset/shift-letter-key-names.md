---
"ink-cartridge": minor
---
Normalize Shift+letter key names and restore the focus-group string shorthand inside layer elements.

### Added
None

### Changed
None

### Fixed
- `Shift+<letter>` bindings now fire under the canonical lower-case name. Ink reports a shifted character as the form it produces (`"S"` for Shift+S), so `normalizeKeyNames` emitted `shift+S` while bindings and docs use `shift+s`; the adapter now lower-cases the character part of modifier variants, making `boundKeyboard("shift+s", …)`, sequence bindings, and focus-scoped bindings work.
- Focus-group APIs now work inside layer and modal elements when the group is passed as a string (`focusNext("form")`, `focusSet(id, "form")`, `focusCurrent("form")`, `useFocusState(id, "form")`, …). The adapter returned the string unchanged, so the engine received a group name without the element id, failed to resolve the element keyboard, and the call silently returned `false` or `noLayer`; the shorthand is now wrapped as `{ group, element }`, matching the object form.

### Breaking Changes
- Bindings registered with the accidental upper-case spelling (`"shift+S"`, `"meta+S"`, …) no longer match. Rename them to the canonical lower-case form (`"shift+s"`, `"meta+s"`, …).

### Tests
- `tests/keyboard/base/keyNormalizer.test.ts` covers the real Ink event shape (upper-case `input` with `shift: true`).
- `tests/keyboard/shift-letter-binding.test.tsx` drives the bundled adapter end-to-end through `ink-testing-library`, asserting both the Shift+S trigger and the plain-`s` non-trigger.
- `tests/keyboard/focus-group-layer.test.tsx` exercises `focusNext("form")` and `focusSet(id, "form")` from inside a layer element through `useFocusState`, with the object form as a control.
