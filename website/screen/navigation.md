# Navigation

All three navigation methods come from `useScreenSystem()`, and can also be imported directly from `ink-cartridge`:

| Method | Direction | Target |
|---|---|---|
| `skip` | Down | A direct child of the current screen |
| `back` | Up | A parent screen, optionally several levels |
| `gotoScreen` | Any | Any registered screen, rebuilding the path from the lowest common ancestor |

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Organizing Screens](/screen/screen-registry) | Navigation happens on the screen tree |
| [Basic Binding](/keyboard/base-bind) | Navigation is usually driven by keys |

## skip

```ts
skip(component, params?, options?)
```

- The target must be a direct child of the current screen, otherwise it throws:
  `"<X>" is not a child of "<Y>". Use skip to navigate down the tree, or gotoScreen to jump across branches.`
- `params` merges with the registered template: `{ ...template, ...params }`. It may be omitted when the target has no required props.
- `options.onlyAttribute` is covered under in-place refresh below.

```tsx
const { skip } = useScreenSystem()
const { boundKeyboard } = useKeyboard()

useEffect(() => boundKeyboard('s', () => skip(Game, { level: 1 })), [boundKeyboard, skip])
```

`skip(Current, params)` — where `Current` is the registered component of the current screen — refreshes it: the top entry is replaced and remounted by default. Path depth is unchanged, so `back` still returns to the real parent.

## back

```ts
back(levels = 1)
```

- `levels` must be at least 1, otherwise: `back() levels must be >= 1.`
- At the root: `back() failed: already at the root node, cannot go back.`

```tsx
back()    // parent
back(2)   // two levels up
```

## gotoScreen

```ts
gotoScreen(component, params?, options?)
```

`gotoScreen` can jump to any registered screen. It finds the lowest common ancestor of the current and target screens, then rebuilds the path; `back` afterwards returns to that ancestor, not to the screen you left.

```tsx
const { gotoScreen } = useScreenSystem()

gotoScreen(Settings, { theme: 'light' })
```

- Unregistered target: `"<X>" is not registered. Please call registerComponent() first.`
- `params` merges exactly like `skip`.
- When the target is the current screen or an ancestor, `params` replace that entry's template; the screen is remounted by default and pages below it are dropped, as with any jump to an ancestor.

## In-place refresh: onlyAttribute

```ts
skip(Current, params, { onlyAttribute: true })
gotoScreen(Current, params, { onlyAttribute: true })
```

- Only meaningful when the target is already on the current path; otherwise it is silently ignored.
- `false` (default): remount the target with the new props, resetting internal state.
- `true`: update props only. For the current screen the mounted instance is kept, including internal state and the mouse `regionFocus` map.
- An ancestor is not mounted while a deeper page is on top, so it remounts either way; what `onlyAttribute` preserves there is the page's stored `regionFocus` map.
- Non-`crossPage` layers are filtered out in both modes.

## Boundaries

- `skip` cannot jump to siblings, ancestors, or unregistered screens.
- `gotoScreen` drops the path below the target; use `onlyAttribute` to refresh the current screen without losing its state.
- `params` merge into the registered template; the template itself is never modified.
- Page switches close regular layers and modal layers with `crossPage: false`, see [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover).
- The module-level imports behave exactly like the hook versions; calling them without a mounted provider throws.
