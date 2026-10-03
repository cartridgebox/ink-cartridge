# Using the engine without React

The core keyboard logic lives in the framework-agnostic `KeyboardEngine` class; `KeyboardProvider` is only its React adapter. A Vue, Svelte, or plain Node app can hold an engine instance directly.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The engine implements exactly the binding, global-key, … mechanisms |
| [Module-level Keyboard API](/keyboard/module-api) | The module-level functions drive the same engine instance |

## KeyboardEngine

- Import it by name from `ink-cartridge` (or `@cartridge-engine/keyboard-engine`).
- Construct with `new KeyboardEngine(props: EngineProps)`, see below.

## EngineProps

- `normalizeKeyNames` {Function} **Required.** Normalizes native key info into key names, see [Key Names](/keyboard/key-names).
- `isNormalChar` {Function} **Required.** Reports whether a key is a normal character.
- `modes` {string[]} Modes registered at construction. **Default:** `[]`.
- `defaultMode` {string} The initial mode. **Default:** no-mode.
- `processors` {KeyboardProcessorProps[]} Processors injected into the pipeline at construction.
- `defaultTimeout` {number} Composition-chain timeout in ms. **Default:** `400`.
- `valueSchema` {ValueSchema} Value-type validation for composition.
- `autoTab` {boolean} Whether the engine takes over Tab / Shift+Tab. **Default:** `false`.
- `tabKey` {string} The key name used for focus rotation. **Default:** `"tab"`.

## Driving the engine

- `sync(state)` Pushes screen / layer state into the engine. Call it after every render or state update, before `processKey`; `state` is `{ pagePath, layers, modalLayers }`, with layers sorted by ascending `zIndex`.
- `processKey(input, key)` Handles one key press.
  - Returns: {boolean} `true` when a processor consumed the event, otherwise `false`.
- `pushOwner(owner)` / `popOwner(owner)` Maintain the owner stack by hand, for owner-scoped bindings (`boundKeyboard` / `boundSequence` / `stop` / `penetration` / `allowModal`).
- `boundKeyboard` / `globalKeys` / `addMapping` and the rest keep the same names and meanings as the React version.

```ts
import { KeyboardEngine, normalizeKeyNames, isInkSpecialKey } from "ink-cartridge";

const engine = new KeyboardEngine({
  modes: ["normal", "insert"],
  defaultMode: "normal",
  normalizeKeyNames,
  isNormalChar: (key) => !isInkSpecialKey(key),
});

engine.sync({ pagePath: [MyScreen], layers: [], modalLayers: [] });
engine.boundKeyboard(["ctrl+s"], () => save());

// inside your key handler
engine.processKey(input, key);   // true = consumed
```

## Injecting an existing engine into React

`KeyboardProvider`'s `engine` prop accepts a pre-built instance; when it is supplied, the `modes` / `defaultMode` / `processors` / `valueSchema` / `autoTab` props are ignored (`mouse` still wires up independently).

```tsx
const engine = useMemo(
  () => new KeyboardEngine({ normalizeKeyNames, isNormalChar }),
  [],
)

<KeyboardProvider engine={engine}>…</KeyboardProvider>
```
