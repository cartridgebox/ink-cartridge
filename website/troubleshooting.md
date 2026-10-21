# Troubleshooting

Grouped by symptom. Most failures are silent; check attribution, provider order, and layer state first.

## A key does nothing

| Possible cause | Check |
|---|---|
| Provider nesting reversed | `KeyboardProvider` must nest inside `ScenarioManagementProvider` |
| Owner inactive | The screen is in the stack, the layer is open, the element is `active` |
| Gated | Check `mode`, `when`, and whether a named condition is registered |
| Focus elsewhere | Only the active focus target's bindings match; confirm with `focusCurrent()` |
| Modal barrier | Unhandled keys are swallowed; use `allowModal` |
| `stopsWorkingAfterLayerAppearing` | Page bindings are dormant while any layer is open |
| Exact key wins over `'*'` | Call `enableWildcardPriority()` when the wildcard must run first |

## Ghost keys

Bindings from a screen you left still fire: the binding was registered in `useEffect` without returning the unbind function. Return it, or call it manually.

## Focus

- **Target disappears after unbinding**: with `releaseFocusWhenEmpty`, the last unbind removes it; re-register the same `focusId` to recreate it.
- **`focusSet` throws**: the target is created lazily; register a binding with that `focusId` first.
- **Named group does not respond**: groups start inactive; call `activateFocusGroup`. `autoTab` rotates the default group only.

## Layers

- **Nothing appears after opening**: `openLayer` creates an empty container; mount elements with `applyElement`.
- **Layer is gone after navigation**: `crossPage` defaults to `false`.
- **A cross-page layer steals keys**: scope it with `automaticTakeoverKeyboard`.
- **`bringLayerToFront` does nothing**: it only affects regular layers; modal and unknown IDs are ignored with a warning.
- **`penetration` is not blocking**: it releases keys; use `stop` to block.

## Mouse

- **Region does not respond**: check `<KeyboardProvider mouse>`, TTY streams, the ref attached to the Box, and that the Box is not 0×0.
- **Click does not move focus**: `useMouseRegion` and `boundKeyboard` must receive the same object ref; a callback ref fails silently.
- **`onDragMove` stops**: the drag target is captured at press, so it should not stop; check whether the component unmounted mid-drag.
- **Overlapping regions pick the wrong one**: raise the child control's `priority`.

## Composition and sequences

- **A chain is not undoable**: only timeouts, `isEndKey`, and `execute` returning `null` record it; an unmatched key drops the chain.
- **Undo throws**: the request exceeds the buffer; query `bufferedCompositionCount()` first.
- **A sequence does not fire**: check `timeout`, mismatched keys (`exclusive`), and whether the focus target is active.

## Common error messages

| Message | Cause |
|---|---|
| `[ink-cartridge] No KeyboardEngine is mounted. …getEngine()…` | A module-level API call with no `KeyboardProvider` |
| `[ink-cartridge] Condition "<id>" is not registered. …` | A named condition was never registered |
| `[keyboard-engine] <fn>() must be called inside a screen component or overlay.` | An owner-scoped method with no owner |
| `… declared in globalKeys with cover: false, so overriding is not allowed.` | Overriding a `cover: false` global key |
| `Cannot undo N sequence(s): only M buffered.` | Undo exceeds the buffer |
| `[keyboard-engine] focusSet("<id>"): focus target not found …` | The target has not been created |
| `[ink-cartridge] Mouse tracking requires a TTY input stream …` | Mouse enabled without a TTY |

## Testing

- Escape (`\x1b`) is unreliable with `ink-testing-library`.
- Effects settle after `flush()` (about 50ms).
- Use `clearRegistry()` and `clearDispatchers()` for isolation.

## TypeScript

- `useRef<<T>` in TSX parses as JSX; write `useRef<T>`.
