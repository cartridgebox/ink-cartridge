# Troubleshooting

Cross-chapter pitfalls and error messages, grouped by symptom.

## Keys do not respond

- **Providers nested the wrong way**: `KeyboardProvider` must sit inside `ScenarioManagementProvider`; reversed, the keyboard silently stops working.
- **Wrong ownership**: a binding is matched only while its owner (screen / layer element) is active, see [Binding Attribution & the Owner Stack](/screen/binding-attribution).
- **Blocked by `mode` / `when`**: check the binding's `mode` and `when`, see [Modes](/keyboard/modes) and [Intermediate Binding](/keyboard/boundKeyboard-advanced).
- **Modal takeover**: a modal layer intercepts every key by default; reopen the ones you need with `allowModal`, see [Passing Keys with allowModal](/screen/allow-modal).

## Layers and propagation

- **`penetration` passes keys through, it does not block them** (an easy misread); use `stop` to block. See [Passing Keys Through](/keyboard/penetration) and [Stopping Key Propagation](/keyboard/stop).
- **Cross-page layers are reclaimed**: non-persistent layers and modal layers (`crossPage: false`) are removed on `skip` / `back` / `gotoScreen` (handled in the reducer).

## Error boundaries

- `_dispatch` is set in a `useEffect`, so it is unavailable during `componentDidCatch` — calling layer / modal functions from an error boundary yields `null`.

## Testing

- Escape (`\x1b`) is unreliable under `ink-testing-library`; `stdin.write`'s escape-sequence behavior is unstable.

## Types

- `useRef<<T>` parses as JSX in TSX — you must write `useRef<T>`.

## Common error messages

| Message | Cause |
|---|---|
| `[ink-cartridge] No KeyboardEngine is mounted. …getEngine()…` | A module-level API call ran before `KeyboardProvider` mounted |
| `[ink-cartridge] Condition "<id>" is not registered. …` | A named condition was used without `addCondition` first |
| `[keyboard-engine] <fn>() must be called inside a screen component or overlay.` | `stop` / `penetration` etc. called with no owner |
| `… declared in globalKeys with cover: false, so overriding is not allowed.` | A `cover: false` global key was overridden |
