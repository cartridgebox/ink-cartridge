# Custom processors

Every key event flows through a **nine-stage pipeline**. Each stage holds one or more processors, and a processor decides whether the event is consumed at that stage. The built-in processors implement the screen stack, layers, global keys, composition, and so on; you can insert your own processors to observe or rewrite the event stream.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The built-in processors implement exactly the binding, global-key, … mechanisms |
| [Global Key Bindings](/keyboard/global-keys) | `affectLayer` decides which stage a global key lands in |

## The default nine stages

Higher `weight` runs earlier; the built-in values are `builtinProcessorWeights`.

| Stage id | weight | Role |
|---|---|---|
| `modal` | 8000 | Modal-layer barrier |
| `composition-overlay` | 7000 | Overlay-phase composition |
| `global-sequence-overlay` | 6000 | Overlay-phase global sequences |
| `global-key-overlay` | 5000 | Overlay-phase global keys |
| `layer` | 4000 | Layer broadcast |
| `composition-screen` | 3000 | Screen-phase composition |
| `global-sequence-screen` | 2000 | Screen-phase global sequences |
| `global-key-screen` | 1000 | Screen-phase global keys |
| `screen-stack` | 0 | Screen stack |

`processKey` walks stages by descending weight. **Processors of equal weight form one stage**: every member observes the event first, and if any returns `true` the whole stage is consumed and later stages do not run. The built-in weights are all distinct, so each built-in occupies its own stage.

## ProcessorInput

The minimal shape needed to drive a processor.

- `id` {string} The processor name, unique in the pipeline.
- `process` {Function} `(ctx) => boolean`; returning `true` consumes the event and ends the pipeline.
- `active` {boolean} Whether it runs. **Default:** `true`.

## addProcessor(processor, options?)

Inserts a processor into the pipeline.

- `processor` {ProcessorInput} The processor definition, as above.
- `options` {Object} Optional; decides the insertion point.
  - `weight` {number} Explicit weight; equal to a built-in stage merges into it, otherwise it opens a new stage.
  - `index` {number} The nth stage slot (0-based, range `[0, stageCount]`).
  - `before` {string} Insert before the stage holding a given processor, as its own stage.
  - `after` {string} Insert after the stage holding a given processor, as its own stage.
- Returns: nothing.

Omitting `options` uses weight `0`, after every built-in.

```tsx
const { addProcessor } = useKeyboard()

useEffect(() => addProcessor({
  id: "logger",
  process(ctx) { console.log(ctx.input); return false },  // false = don't consume, pass on
}), [addProcessor])

addProcessor(myAudit, { after: "layer" })
addProcessor(myGate, { before: "modal" })
```

## removeProcessor(processorId)

- `processorId` {string} The processor name.
- Returns: {boolean} `true` when it existed and was removed.

## getProcessors()

- Returns: {PipelineProcessor[]} A read-only snapshot in processing order, **including inactive** processors.

## activeProcessor(id)

Activates a processor.

- `id` {string} The processor name.
- Returns: {boolean} `true` when this call activated it; `false` when already active or unknown.

## kickProcessor(id)

Deactivates a processor. `processKey` skips it, but the pipeline array is unchanged.

- `id` {string} The processor name.
- Returns: {boolean} `true` when this call deactivated it; `false` when already inactive or unknown.

## setProcessorWeight(id, weight)

Changes a processor's weight and re-sorts it into the matching stage.

- `id` {string} The processor name.
- `weight` {number} The new weight.
- Returns: {boolean} `true` when it existed and was changed.

## resetProcessors()

Restores the default nine stages, **discarding every custom processor** and its state.

- Returns: nothing.

## Errors

| Case | Error |
|---|---|
| Duplicate id | `Cannot add processor "<id>": duplicate id` |
| Out-of-range index | `Cannot insert processor "<id>" at index <n>: expected an integer in [0, <stageCount>]` |
| Missing `before` / `after` target | `Cannot insert <before\|after> "<id>": processor not found` |
