# Default and named groups

Focus targets are organized into groups. The default group holds every target registered without a group name; named groups let a screen keep several independently active focuses. Each group has at most one active target, but different groups can be active at the same time.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Focus System](/keyboard/focus-system) | Targets, activation, lazy creation |

## Two forms

```tsx
// Default group
boundKeyboard(['up'], move, { focusId: 'nav-item-1' })

// Named group "form"
boundKeyboard(['tab'], nextField, { focusId: { group: 'form', focusId: 'field-1' } })
```

A string `focusId` targets the default group; `{ group, focusId }` targets a named group.

## When named groups help

| Situation | Use |
|---|---|
| One list or form, one active control at a time | Default group |
| Navigation and a form active at the same time | One named group per region |
| Tab should cycle only inside a region | Bind Tab to `focusNext('region')` |
| Tab should cycle every control | Default group + `autoTab` |

Named groups only separate the "one active target" slot; ownership still comes from the call site.

## Pitfalls

- `autoTab` rotates the default group only.
- Each group auto-activates its first target; later targets need `focusSet` / `focusNext`.
- A group emptied by `kickFocusGroup` stays dormant until `activateFocusGroup` or a new target registers.

## Group-scoped operations

```tsx
focusSet('field-2', 'form')
focusNext('form')
focusPrev('form')
focusCurrent('form')
focusUnregister('field-2', 'form')

// Inside a component
const focused = useFocusState('field-1', 'form')
```

Omitting the group targets the default group.

## Activating and clearing

A group's first target is activated automatically when the group is created—this applies to named groups too. Later targets wait for `focusSet` / `focusNext` / `focusPrev`. `activateFocusGroup` gives a group with no active target an initial one, for example after `kickFocusGroup`:

```ts
activateFocusGroup('field-1', 'form')
```

- Only works when the group has no active target; otherwise it returns `false` and does not switch.
- Returns `false` when the group is unknown or the `focusId` is not in it.

```ts
kickFocusGroup('form')
```

Removes the group's active target and leaves the group inactive. Returns `false` when there is no active target or the group is unknown. Omitting the group targets the default group.

## Multi-group routing

With several groups active, the engine collects bindings from each group's active target and tries them in activation order, stopping at the first hit:

- Different groups can answer different keys simultaneously.
- If two groups bind the same key, the earlier-activated group wins.
- Within a group, only one target participates.

## autoTab

`autoTab` rotates the default group only. Named groups need an explicit binding:

```tsx
boundKeyboard('tab', () => focusNext('form'))
```

## Boundaries

- `focusNext` / `focusPrev` do nothing when the group has no active target.
- `activateFocusGroup` does not switch between existing active targets; use `focusSet`.
- `kickFocusGroup` clears the whole group, not just one target.
- A named group's first target is auto-activated like the default group's; only later targets need an explicit switch.
- Groups are destroyed with the screen's keyboard layer and do not survive leaving the screen.
- Named groups use the same `focusId` matching rules; attribution is still decided by the call site.
