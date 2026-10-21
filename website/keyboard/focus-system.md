# Focus system

Focus decides which of several components in the same layer answers a key. Each focus target has a unique `focusId`, and a group has at most one active target. Only bindings on the active target are tried.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | `focusId` is a binding option |

## Focus targets

Adding `focusId` scopes a binding to a target instead of the whole layer:

```tsx
boundKeyboard(['up', 'down'], handleUpDown, { focusId: 'select-a' })
```

- A target is created lazily on the first binding registered with that `focusId`.
- The first target created in a group is activated automatically; later ones wait for an explicit switch.
- Unbinding does not unregister the target; it still occupies its place in the order.
- Leaving a screen destroys its keyboard layer and all focus targets with it.

## Control methods

| Method | Signature | Effect |
|---|---|---|
| `focusSet` | `(focusId, groupOrOptions?)` | Force-activate a target |
| `focusNext` | `(groupOrOptions?)` | Move forward in registration order, wrapping |
| `focusPrev` | `(groupOrOptions?)` | Move backward |
| `focusCurrent` | `(groupOrOptions?)` | Read the active target without rendering |
| `focusUnregister` | `(focusId, groupOrOptions?)` | Unregister a target |
| `useFocusState` | `(focusId, group?)` | Subscribe to whether this target is active |

`groupOrOptions` is a group name or `FocusSetOptions`:

```ts
type FocusSetOptions = { group?: string; element?: string }
```

```tsx
const { focusSet, focusNext, focusPrev, focusCurrent, focusUnregister, useFocusState } = useKeyboard()

focusSet('select-b')
focusNext()
focusPrev()
const { result, noFound } = focusCurrent()
focusUnregister('select-b')

const focused = useFocusState('select-b')
```

`focusCurrent` returns:

```ts
{
  result?: { id: string; fromGroup: string | symbol }
  noFound?: boolean   // no active target in the group
  noOwner?: boolean   // no page or layer
  noLayer?: boolean   // the current owner has no keyboard layer
}
```

`focusNext` / `focusPrev` do nothing when a group has no active target; `focusSet` can activate any registered target directly. After `focusUnregister` removes the active target, focus moves to the first remaining target in registration order.

## autoTab

```tsx
<KeyboardProvider autoTab>
```

The engine intercepts Tab / Shift+Tab and calls `focusNext` / `focusPrev`. It applies to the default group only. For custom Tab behavior, disable `autoTab` and bind manually:

```tsx
boundKeyboard('tab', () => focusNext())
boundKeyboard('shift+tab', () => focusPrev())
```

Non-React hosts can set `tabKey` to the bare forward key name; reverse rotation matches `shift+<tabKey>`.

## releaseFocusWhenEmpty

```tsx
<KeyboardProvider releaseFocusWhenEmpty>
```

Off by default. When enabled, bindings hold a reference to their focus target and the last release removes it. Registering the same `focusId` again recreates it. Focus moves to the group's first remaining target, or the group slot is cleared when none remains.

## Subscribing to focus changes

```ts
const { subscribeFocus } = useKeyboard()

useEffect(() => subscribeFocus(() => {
  setCurrent(focusCurrent().result?.id)
}), [subscribeFocus, focusCurrent])
```

`useFocusState` is the usual declarative wrapper. `subscribeFocus` fits code outside a component or reads across several groups.

## Boundaries

- `focusSet` on an unknown target throws and lists the available targets in that group.
- `useFocusState` reads during render, so a component reused with a different `focusId` reflects the new target immediately.
- Component unmount and screen leave differ: unmount only unbinds; the target stays on the screen. Call `focusUnregister` in the cleanup function to remove it.
- Named groups and multi-group routing are covered in [Default and named groups](/keyboard/focus-group).
