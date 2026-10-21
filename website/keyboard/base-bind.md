# Basic binding

`boundKeyboard` binds one or more keys to a callback and attributes the binding to the keyboard layer of the call site. It is the base of the keyboard system: actions, sequences, focus, and global keys all build on the same attribution and pipeline.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Quick Start](/quick-start-1) | Provider nesting order |

## Signature

```ts
boundKeyboard(keys: string | string[], handler: KeyHandler, options?: BoundKeyboardOptions): () => void
```

- `keys` {string | string[]} Normalized key names such as `'s'`, `'ctrl+q'`, or `['1', '2', '3']`.
- `handler` {() => void} Callback invoked on a match.
- `options` {BoundKeyboardOptions} See below.
- Returns: an unbind function.

Two action-id overloads are covered in [Shortcuts & Actions](/keyboard/shortcuts-actions).

```tsx
function Menu() {
  const { boundKeyboard } = useKeyboard()
  const [selected, setSelected] = useState(1)

  useEffect(() => {
    const un1 = boundKeyboard('1', () => setSelected(1))
    const un2 = boundKeyboard('2', () => setSelected(2))
    return () => { un1(); un2() }
  }, [boundKeyboard])

  return <Text>selected: {selected}</Text>
}
```

The providers must nest in this order. A missing or outer `KeyboardProvider` makes the keyboard silently inert:

```tsx
<ScenarioManagementProvider defaultScreen={Menu} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

## Options

| Option | Type | Effect | Default |
|---|---|---|---|
| `mode` | `string` | Active only in the matching mode | all modes |
| `once` | `boolean` | Unbind after the first trigger | `false` |
| `times` | `number` | Trigger after N presses; repeats | — |
| `observer` | `(remaining) => void` | With `times`, reports presses remaining | — |
| `when` | `() => boolean \| string` | Condition callback or named condition ID | — |
| `focusId` | `string \| FocusRef` | Scope to a focus target | — |
| `elementId` | `string` | Scope to a layer element | injected |
| `stopsWorkingAfterLayerAppearing` | `boolean` | Dormant while any layer or modal is open | `false` |
| `ref` | `RefObject` | Share focus with a mouse region; see [Mouse-driven keyboard focus](/mouse/mouse-focus) | — |

```tsx
boundKeyboard('s', () => save(), { mode: 'insert' })
boundKeyboard('*', () => start(), { once: true })
boundKeyboard('x', () => confirm(), { times: 3 })
```

A string `when` must reference a condition registered with `addCondition`; see [Intermediate binding](/keyboard/boundKeyboard-advanced).

## Unbinding

Return the unbind function from `useEffect` so the binding is removed on unmount or when dependencies change:

```tsx
useEffect(() => boundKeyboard('s', () => save()), [boundKeyboard])
```

When the callback reads component state, include that state in the dependency array. The `boundKeyboard` reference itself is stable.

## Propagation

Bindings live in the screen-stack stage. An event first passes modal layers, global keys, and layers; if none consumes it, the screen stack tries the current screen and then the screens below it. The first match stops propagation.

Keys the current screen does not handle fall through to lower screens by default. That requires the lower screens' bindings to still exist—forgetting to return the unbind function leaves ghost keys after leaving a screen.

## Wildcard priority

Exact keys match before `'*'` by default. To make `'*'` win first—for example, a text input that captures every printable character—call `enableWildcardPriority()`:

```ts
const { enableWildcardPriority } = useKeyboard()

useEffect(() => enableWildcardPriority(), [enableWildcardPriority])
```

It is reference-counted; the default order returns when the last returned disable function runs.

## Boundaries

- Available only inside `KeyboardProvider`; attribution resolves through `useKeyboard()`.
- Register inside `useEffect` (or an event callback), never during render.
- Attribution follows the call site; see [Binding attribution and the owner stack](/screen/binding-attribution).
- A focus target participates only while active; `focusId` creates the target lazily.
- Key names must use the normalized spelling; see [Key names](/keyboard/key-names).
