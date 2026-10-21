# Mouse-driven keyboard focus

A mouse region can forward clicks or hover into focus changes, so one component responds to both mouse and keyboard. The switches are `clickOnFocus`, `enterOnFocus`, and `leaveOffFocus`.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The link is established by `boundKeyboard`'s `ref` and `focusId` |
| [Focus System](/keyboard/focus-system) | Focus targets and `useFocusState` |
| [Binding attribution](/screen/binding-attribution) | The link is recorded in the caller's scope |

## Mechanism

```ts
type RegionFocusEntry = { focusId: string | FocusRef }
type RegionFocusMap = Map<RefObject<DOMElement | null>, RegionFocusEntry>
```

- The key is the **ref object itself**, not `regionId` or an element ID; a different object never matches.
- The table lives on the page, each regular layer, and each modal layer, so it survives `CurrentScreen` re-renders.
- `boundKeyboard` / `boundSequence` with `{ ref, focusId }` write the table; `useMouseRegion` reads it. Both must land on the same scope; priority is layer element > modal element > page.

## Establishing the link

Pass the same ref to both hooks:

```tsx
function FocusButton({ focusId }: { focusId: string }) {
  const { boundKeyboard } = useKeyboard()
  const focused = useFocusState(focusId)
  const ref = useMouseRegion({ onClick: () => activate() })

  useEffect(
    () => boundKeyboard(['s'], () => activate(), { ref, focusId }),
    [boundKeyboard, ref, focusId],
  )

  return <Box ref={ref} borderColor={focused ? 'green' : 'gray'}>…</Box>
}
```

- `useMouseRegion` measures, hit-tests, and reads the table.
- `{ ref, focusId }` writes the table and registers the key normally.
- Without `{ ref, focusId }`, a click is just a callback.

The ref must be an object ref. A callback ref is rejected and replaced with an internal ref, silently losing the link. Several bindings can share one ref; the entry is reference-counted and removed on the last unbind.

## Execution order

| Callback | Order |
|---|---|
| `onClick` | `clickOnFocus` forwards focus → your `onClick` |
| `onEnter` | `enterOnFocus` forwards focus → your `onEnter` |
| `onLeave` | clear focus (see below) → your `onLeave` |

Focus updates synchronously in the engine; `useFocusState` catches up on the next render. Use `focusCurrent()` inside a callback to read the new focus immediately.

## Options

| Option | Default | Behavior |
|---|---|---|
| `clickOnFocus` | `true` | A click forwards focus |
| `enterOnFocus` | `false` | Entering the region forwards focus |
| `leaveOffFocus` | `true` | Only consulted when `enterOnFocus: true`; leaving clears focus |

`leaveOffFocus` never affects a click-only region, so moving the pointer away does not drop the focus a click just set.

```tsx
useMouseRegion({ onClick: select }, { clickOnFocus: false })
useMouseRegion({ onEnter: hover, onLeave: unhover }, { enterOnFocus: true, leaveOffFocus: false })
```

## Named groups

```ts
boundKeyboard(['s'], activate, {
  ref,
  focusId: { group: 'nav', focusId: 'nav-item-1' },
})
```

| Entry shape | Enter / click | Leave |
|---|---|---|
| String | Set default-group focus | `kickFocusGroup()` |
| `FocusRef` | Set named-group focus | `kickFocusGroup({ group })` |

Leaving clears whatever the group currently holds, not only the registered `focusId`.

## Sequences

`boundSequence(keys, actionId, { ref, focusId })` writes the same table. After a click moves focus, only the focused region starts matching its sequence, so the same key pair can take different branches per panel.

## Troubleshooting a silent link

1. Is `<KeyboardProvider mouse>` enabled?
2. Do both hooks receive the same ref object?
3. Is it an object ref rather than a callback ref?
4. Do the writing and reading calls share a scope (same component is enough)?
