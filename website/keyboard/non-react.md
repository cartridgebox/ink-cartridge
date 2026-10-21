# Using the engine without React

`KeyboardEngine` is the framework-agnostic core; `KeyboardProvider` is only its React adapter. A Vue, Svelte, or plain Node host can own an engine instance and run its own "sync screen state → process keys → clean stale layers" loop.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The engine exposes the same binding methods |
| [Binding attribution](/screen/binding-attribution) | Non-React hosts maintain the owner stack manually |
| [Key names](/keyboard/key-names) | Construction needs two key-name functions |

## Construction

```ts
new KeyboardEngine(props: EngineProps)
```

| Field | Type | Effect | Default |
|---|---|---|---|
| `normalizeKeyNames` | `(input, key) => string[]` | **Required**; normalizes key names | — |
| `isNormalChar` | `(key) => boolean` | **Required**; identifies printable characters | — |
| `modes` | `string[]` | Initial modes | `[]` |
| `defaultMode` | `string` | Initial mode name | no mode |
| `processors` | `KeyboardProcessorProps[]` | Processors injected at construction | — |
| `defaultTimeout` | `number` | Composition-chain timeout (ms) | `400` |
| `valueSchema` | `ValueSchema` | Composition value validation | — |
| `autoTab` | `boolean` | Handle Tab / Shift+Tab | `false` |
| `tabKey` | `string` | Forward Tab key; reverse matches `shift+<tabKey>` | `"tab"` |
| `releaseFocusWhenEmpty` | `boolean` | Remove a focus target when its last binding unbinds | `false` |

```ts
import { KeyboardEngine, normalizeKeyNames, isInkSpecialKey } from 'ink-cartridge'

const engine = new KeyboardEngine({
  normalizeKeyNames,
  isNormalChar: (key) => !isInkSpecialKey(key),
  modes: ['normal', 'insert'],
  defaultMode: 'normal',
})
```

## Driving loop

```ts
engine.sync(state)             // push page and layer state
engine.processKey(input, key)  // process one key press
```

The `sync` state:

```ts
{
  pagePath: Component[]     // root to current screen
  layers: Layer[]           // regular layers, ascending zIndex
  modalLayers: Layer[]      // modal layers, ascending zIndex
}
```

Call `sync` after every page or layer change, before processing keys. `processKey` returns `true` when the event was consumed.

```ts
engine.sync({ pagePath: [Menu], layers: [], modalLayers: [] })
const un = engine.boundKeyboard(['ctrl+s'], () => save())

// In the host's key handler
engine.processKey(input, key)
```

## Owners and elements

Inside a layer element the host must push the owner and pass `elementId`:

```ts
engine.pushOwner('tool-panel')
engine.boundKeyboard('w', () => step(), { elementId: 'panel-body' })
engine.popOwner('tool-panel')
```

- `pushOwner` / `popOwner` remove the most recent matching value on pop.
- `boundKeyboard`, `boundSequence`, `stop`, `penetration`, and `allowModal` all need an owner.
- `allowModal` only takes effect on a modal-layer element.

## Cleaning stale keyboard layers

After `sync`, the engine may still hold keyboard data for pages or layers that are no longer in the snapshots. Three methods prune by source:

```ts
engine.cleanLayers()          // keyboard data for pages no longer in pagePath
engine.cleanOverlayLayers()   // element keyboards for closed regular layers
engine.cleanModalLayers()     // element keyboards for closed modal layers
```

The React adapter does this during state synchronization; a non-React host calls the matching method after pages or layers change.

## Mouse

Hand raw mouse events to the engine for region hit-testing:

```ts
engine.processMouseEvent(event)
engine.getHoveredMouseRegion()
```

The `Mouse` class parses terminal input into events; see [Raw mouse API](/mouse/mouse-raw).

## Injecting into React

`KeyboardProvider`'s `engine` prop accepts a pre-built instance. `modes` / `defaultMode` / `processors` / `valueSchema` / `autoTab` / `releaseFocusWhenEmpty` are then ignored, while `mouse` still wires up independently:

```tsx
const engine = useMemo(
  () => new KeyboardEngine({ normalizeKeyNames, isNormalChar }),
  [],
)

<KeyboardProvider engine={engine}>…</KeyboardProvider>
```

## Boundaries

- `sync` must run before `processKey`; stale screen state misroutes attribution and focus.
- Owner-scoped methods throw when no owner exists.
- The engine does not manage terminal raw mode; the host or `Mouse` does.
- Module-level functions always target the most recently mounted engine; a non-React host should hold its instance directly.
