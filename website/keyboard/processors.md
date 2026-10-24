# Custom processors

Every key event flows through a pipeline ordered by `weight`. A processor returns `true` to consume the event and stop the pipeline, or `false` to pass it on. Built-in processors implement modal layers, composition, global keys, layers, and the screen stack; custom processors can observe or rewrite the stream.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Built-in processors implement the binding mechanisms |
| [Global Key Bindings](/keyboard/global-keys) | `affectLayer` decides a global key's stage |

## The default nine stages

| Stage id | weight | Role |
|---|---:|---|
| `modal` | 8000 | Modal barrier |
| `composition-overlay` | 7000 | Overlay-phase composition |
| `global-sequence-overlay` | 6000 | Overlay-phase global sequences |
| `global-key-overlay` | 5000 | Overlay-phase global keys |
| `layer` | 4000 | Layer broadcast |
| `composition-screen` | 3000 | Screen-phase composition |
| `global-sequence-screen` | 2000 | Screen-phase global sequences |
| `global-key-screen` | 1000 | Screen-phase global keys |
| `screen-stack` | 0 | Screen stack |

- Stages run in descending weight; processors with equal weight form one stage.
- Inside a stage, every member observes the event first; if any returns `true`, the whole stage is consumed and later stages do not run.
- Built-in weights are all distinct, so each built-in occupies its own stage.

## ProcessorInput

```ts
type ProcessorInput = {
  id: string
  process(ctx: PipelineContext): boolean
  active?: boolean   // default true
}
```

`PipelineContext` snapshots the state for one event:

| Field | Content |
|---|---|
| `input` / `key` | Raw terminal input and Ink's key descriptor |
| `eventNames` | Normalized key names |
| `topComponent` / `pagePath` | Top screen and full page path |
| `allLayers` / `allModalLayers` | Current layer snapshots |
| `globalKeys` / `globalSequences` | Resolved global entries |
| `currentMode` / `conditions` | Current mode and named conditions |
| `compositionEngine` | Shared composition engine |
| `wildcardFirst` | Whether wildcards take priority |
| `autoTab` / `autoTabKey` | Tab rotation configuration |
| `layersRef` / `layerKeyboardRefs` / `pendingSeqRef` | Mutable state references |
| `notifyFocusChange` / `notifyPendingSyncs` | Notification callbacks |
| `compositionEngineHandler` | Whether the composition engine is handling the event |

## Insertion and ordering

```ts
addProcessor(processor, options?)
```

| Option | Effect |
|---|---|
| `weight` | Explicit weight; merges into an existing stage or opens a new one |
| `index` | Stage slot, 0-based, range `[0, stageCount]` |
| `before` / `after` | Insert before or after the stage holding a processor, as its own stage |

`addProcessor` returns `true` when the processor was inserted. A duplicate id or a missing `before`/`after` target returns `false` and leaves the pipeline unchanged; an out-of-range `index` throws.

Without options the weight is `0`, so the processor joins the `screen-stack` stage after `screen-stack` itself. It only sees events `screen-stack` did not consume. For an independent stage after every built-in, pass a negative weight:

```ts
addProcessor(myAudit, { weight: -1 })
```

```tsx
const { addProcessor } = useKeyboard()

useEffect(
  () => addProcessor({
    id: 'logger',
    process(ctx) {
      console.log(ctx.eventNames)
      return false
    },
  }),
  [addProcessor],
)
```

`KeyboardProvider`'s `processors` prop injects processors at construction with `{ processor, index }`, `{ processor, target, position }`, or `{ processor }`.

## Management

| Method | Effect |
|---|---|
| `removeProcessor(id)` | Removes; returns whether it existed |
| `getProcessors()` | Read-only snapshot in execution order, including inactive processors |
| `activeProcessor(id)` | Activates; `false` if already active or unknown |
| `kickProcessor(id)` | Deactivates; the pipeline array is unchanged |
| `setProcessorWeight(id, weight)` | Re-weights and re-sorts the stage |
| `resetProcessors()` | Restores the nine stages and discards every custom processor |

## Errors

Duplicate ids and missing `before`/`after` targets do not throw; `addProcessor` returns `false`. Only an out-of-range `index` throws:

| Case | Error |
|---|---|
| Out-of-range index | `[ink-cartridge] Cannot insert processor "<id>" at index <n>: expected an integer in [0, <stageCount>]` |

## Boundaries

- Processors share one `PipelineContext`; mutating a mutable reference affects later stages.
- Returning `true` blocks later stages, including the screen stack. Return `false` while debugging.
- `resetProcessors()` removes every runtime processor; use it for tests or hot reload.
- The module-level API exposes the same functions; see [Module-level keyboard API](/keyboard/module-api).
