# Intermediate binding

The advanced `boundKeyboard` options cover three areas: condition gating (`when`), press counting (`times` / `observer`), and dormancy while a layer is open (`stopsWorkingAfterLayerAppearing`).

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | `mode` / `once` / `times` basics |

## Conditions: when

```ts
when: (() => boolean) | string
```

A function is evaluated at key-press time, so it reads the current value captured by its closure. For frequently changing state, mirror it into a `useRef` to avoid rebuilding the binding:

```tsx
const healthRef = useRef(health)
useEffect(() => { healthRef.current = health }, [health])

useEffect(
  () => boundKeyboard('b', () => back(), { when: () => healthRef.current <= 50 }),
  [boundKeyboard, back],
)
```

The string form references a named condition; the binding is registered once:

```ts
const { addCondition, setCondition, removeCondition } = useKeyboard()

addCondition('lowHealth', false)   // returns false if it already exists
setCondition('lowHealth', true)    // effective on the next key press
removeCondition('lowHealth')
```

| | Function `when` | Named condition |
|---|---|---|
| Source | State captured by the closure | A named boolean in the engine |
| Update | Rebuild through the dependency array | Call `setCondition` anywhere |
| Best for | Simple component-local conditions | Conditions shared across bindings, components, or screens |

Named conditions differ from modes: several conditions can be true at once, while modes are mutually exclusive.

## Press counting: times and observer

```ts
boundKeyboard('x', () => confirm(), {
  times: 3,
  observer: (remaining) => setHint(`${remaining} more`),
})
```

- `times` must be at least 1; the handler fires on the Nth press, then counting restarts.
- `observer` requires `times`. It runs on every press with the remaining count, ending at `0`, which is the press that fires the handler.

```tsx
useEffect(
  () => boundKeyboard('b', () => back(), {
    times: 3,
    observer: (remaining) => setRemaining(remaining),
  }),
  [boundKeyboard, back],
)
```

## Dormancy while a layer is open

```ts
boundKeyboard('x', () => act(), { stopsWorkingAfterLayerAppearing: true })
```

The page-level binding is skipped while any regular layer or modal layer is open; it resumes when all of them close. The option applies to page bindings only—layer-element bindings already follow the layer lifecycle. Page bindings with a `focusId` follow the same rule.

## Errors

| Case | Error |
|---|---|
| `observer` without `times` | `[keyboard-engine] boundKeyboard() observer option requires times option to be set.` |
| `times < 1` | `[keyboard-engine] boundKeyboard() times option must be >= 1.` |
| Unregistered `when` string | `[ink-cartridge] Condition "<id>" is not registered. Call addCondition("<id>", <defaultValue>) ...` |
