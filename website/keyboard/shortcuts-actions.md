# Shortcuts & Actions

The action system separates "which key is pressed" from "which callback runs": register a callback under a unique `actionId`, then bind keys by that ID. Changing a keybinding never touches the callback, and changing the callback never requires re-binding.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The other two `boundKeyboard` overloads |

## Action entry

```ts
type ShortcutOperationEntry = {
  actionId: string
  action: () => void
  keys?: string[]
}
```

- `actionId` is unique; bindings and triggers use it.
- `keys` is an optional preset keybinding.

```ts
const { defineShortcutAction, addAction } = useKeyboard()

defineShortcutAction([
  { actionId: 'save', action: () => save(), keys: ['s'] },
  { actionId: 'reset', action: () => reset(), keys: ['r'] },
])

addAction({ actionId: 'quit', action: () => process.exit(0) })
```

| Method | Returns | Effect |
|---|---|---|
| `defineShortcutAction(entries)` | `boolean` | Registers several atomically; `false` if any id already exists (nothing is registered) |
| `addAction(entry)` | `boolean` | Registers one; `false` on a duplicate id |
| `hasAction(actionId)` | `boolean` | Whether it is registered |
| `removeAction(actionId)` | `boolean` | Removes; `false` when unknown |
| `modifyAction(actionId, keys)` | `boolean` | Changes preset keys; `false` when unknown or registered without `keys`; affects later bindings only |

The registry belongs to the current engine instance; `useKeyboard()` returns the one owned by the active `KeyboardProvider`.

## Three binding forms

| Form | Effect |
|---|---|
| `boundKeyboard(keys, handler, options?)` | Ordinary callback binding |
| `boundKeyboard(actionId, options?)` | Bind using the action's preset keys |
| `boundKeyboard(keys, actionId, options?)` | Bind using explicit keys, overriding presets |

```ts
boundKeyboard('save')            // preset keys of save
boundKeyboard(['x'], 'save')     // explicit key x
boundKeyboard(['t'], 'toggle')   // actions without preset keys need this form
```

- `boundKeyboard(actionId)` requires the action to have been registered with `keys`, otherwise it throws `does not have predefined keys`.
- Both forms throw when the action is unknown: `[keyboard-engine] Action "<id>" is not registered.`

## Sequence actions

`boundSequence` uses a separate sequence-action registry:

```ts
defineSequenceAction([{ sequenceActionId: 'goto-top', action: scrollTop, keys: ['g', 'g'] }])

boundSequence('goto-top')                    // preset keys
boundSequence(['ctrl+g', 'g'], 'goto-top')   // explicit keys override presets
```

| Method | Returns | Notes |
|---|---|---|
| `defineSequenceAction(entries)` | `boolean` | Atomic; `false` if any id already exists |
| `addSequenceAction(entry)` | `boolean` | `false` on a duplicate id |
| `hasSequenceAction(id)` | `boolean` | Whether it is registered |
| `removeSequenceAction(id)` | `boolean` | `false` when unknown |
| `modifySequenceAction(id, keys, timeout?)` | `boolean` | `false` when unknown or without preset keys; `timeout: 0` is honored |
| `clearSequenceOperations()` | `void` | Removes every sequence action |

Shortcut-action IDs and sequence-action IDs are independent namespaces.

## Shortcut action or sequence action?

| Need | Shortcut action | Sequence action |
|---|---|---|
| One key triggers a callback | Yes | — |
| A key chain triggers a callback | — | Yes |
| Preset keys | `keys` | `keys` + optional `timeout` |
| Bind with | `boundKeyboard` | `boundSequence` |
| Register with | `defineShortcutAction` | `defineSequenceAction` |

Both registries are per engine instance and independent. Use a shortcut action when the trigger is one key; use a sequence action when the trigger itself is a multi-key gesture.

## Boundaries

- One action can be referenced by several keys and bindings.
- `modifyAction` does not rewrite bindings that already exist.
- Exceptions thrown inside an action propagate; handle them in the callback when isolation is needed.
- Return unbind functions for bindings; actions themselves are not removed automatically.
- Module-level calls can register actions directly; see [Module-level keyboard API](/keyboard/module-api).
