# Cross-page layers and keyboard takeover

Regular layers close with the page by default. Use `crossPage: true` to keep one alive across navigation. When a persistent layer must not claim keys on other pages, `automaticTakeoverKeyboard` scopes its keyboard participation.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | Both options belong to `LayerOptions` |
| [Navigation](/screen/navigation) | `crossPage` acts on `skip` / `back` / `gotoScreen` |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | Takeover changes when a layer joins key dispatch |

## crossPage: keep the layer alive

```ts
openLayer('toolbar', 10, { crossPage: true })
```

- `crossPage` {boolean} Defaults to `false`.
- `false`: `skip` / `back` / `gotoScreen` close the layer and all its elements.
- `true`: the layer survives navigation. Element components are not remounted; internal state and the `regionFocus` map are preserved.
- Modal layers support the same option with the same behavior.

`crossPage` only controls deletion on navigation. It does not change the layer's keyboard or mouse priority.

## automaticTakeoverKeyboard: scope keyboard participation

```ts
openLayer('toolbar', 10, {
  crossPage: true,
  automaticTakeoverKeyboard: true,
})
```

- `false` (default): no takeover. The layer participates in key dispatch on every page.
- `true`: the layer participates only on its **host page** — the screen that was on top when the layer opened (stored as `hostPage`). Navigating away makes its bindings dormant; returning restores them.
- `ComponentType[]`: the layer is dormant on the listed pages and active everywhere else. The list wins over the host page — a page in the list stays dormant even if it is the host page.
- Modal layers accept the same option: their elements stop responding while dormant, but the modal layer itself remains and its keyboard barrier still swallows unhandled keys.

The option affects keyboard only. Mouse regions in the layer still take part in hit-testing.

## Typical combinations

A persistent toolbar that answers shortcuts only on its own page:

```tsx
function Editor() {
  const { openLayer, applyElement } = useScreenSystem()

  useEffect(() => {
    openLayer('toolbar', 10, {
      crossPage: true,
      automaticTakeoverKeyboard: true,
    })
    applyElement('toolbar', { element: Toolbar, elementId: 'bar' })
  }, [openLayer, applyElement])
}
```

After navigating from `Editor` to another page, the toolbar stays visible but the keys registered by `Toolbar` no longer respond. Returning to `Editor` restores them.

Yield the keyboard only on selected pages:

```tsx
openLayer('toolbar', 10, {
  crossPage: true,
  automaticTakeoverKeyboard: [Preview, Settings],
})
```

The layer is dormant on `Preview` and `Settings`, and active elsewhere.

## Boundaries

| Case | Behavior |
|---|---|
| `automaticTakeoverKeyboard` with `crossPage: false` | The layer is closed on navigation, so the scope has no effect; the two are normally used together |
| The page array contains the host page | The host page is dormant too; the array check wins |
| `hostPage` is `null` | The path was empty when the layer opened; `true` never makes it dormant |
| The layer is closed and reopened | `hostPage` and the scope are recomputed at the new open time |
| An element is paused with `deactivateElement` | Unrelated; pausing is per element, takeover is per layer |
| Every element of a dormant modal is inactive | The barrier remains; unhandled keys are still swallowed |

Takeover changes key dispatch only. Rendering, mouse hit-testing, and `zIndex` are unchanged.
