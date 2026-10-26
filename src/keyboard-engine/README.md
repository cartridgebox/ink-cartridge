# @cartridge-engine/keyboard-engine

Framework-agnostic keyboard event engine for terminal UIs.

[![test](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/BAIGAOa/ink-cartridge)
[![coverage](https://img.shields.io/badge/coverage-90.49%25-branches-brightgreen)](https://github.com/BAIGAOa/ink-cartridge)
[![npm version](https://img.shields.io/npm/v/@cartridge-engine/keyboard-engine.svg)](https://www.npmjs.com/package/@cartridge-engine/keyboard-engine)

Powered by [ink-cartridge](https://github.com/BAIGAOa/ink-cartridge) — a React Ink component kit for building terminal UIs.

## Overview

`@cartridge-engine/keyboard-engine` is a framework-agnostic keyboard event engine designed for terminal user interfaces (TUIs). It provides complete keyboard binding, focus management, multi-key sequences, modal layers, global shortcuts, and an extensible pipeline processor architecture.

The engine has **zero framework dependencies** — just provide a `normalizeKeyNames` adapter and it works with any host framework (React, Vue, Svelte, raw Node.js, etc.).

## Mouse Support (fork of `xterm-mouse`)

`src/xterm-mouse/` is a **fork of the npm package [`xterm-mouse`](https://www.npmjs.com/package/xterm-mouse)** (MIT). The upstream library is already modular — a `Mouse` facade over focused services (`TTYController`, `MouseEventManager`, `EventStreamFactory`, `MouseConvenienceMethods`, `ClickDetector`, `PositionTracker`). We fixed a number of bugs in the fork (see CHANGELOG / PRs) and integrated it into the keyboard engine. `core/Mouse.original.ts` preserves the original upstream implementation for reference.

The engine integrates mouse events via three methods:

| Method | Description |
|--------|-------------|
| `processMouseEvent(event)` | Hit-test a mouse event against registered regions; drives hover transitions and drag capture |
| `registerMouseRegion(entry)` | Register a region (`layerId` + `regionId` + 1-based terminal rect + callbacks) |
| `unregisterMouseRegion(layerId, regionId)` | Remove a registered region |
| `getHoveredMouseRegion()` | Current hover target (`{ layerId, regionId }` or `null`) |

Hit priority follows keyboard semantics: **modal layers → regular layers → root regions**, later registration wins within a layer; `priority` in a region entry overrides registration order (used for child controls like buttons).

In the React adapter, `<KeyboardProvider mouse>` wires xterm-mouse to the engine automatically and `useMouseRegion` measures an Ink `<Box>` and registers it.

**Terminal note:** click detection needs correct `release` reporting. VS Code's built-in terminal can stop sending releases after simultaneous multi-button presses; the `ClickDetector` then degrades to press-is-click mode (configurable via `MouseOptions.pressStormThreshold` / `degradedDedupDistance`). Windows Terminal / PowerShell report events correctly.

## Installation

```bash
npm install @cartridge-engine/keyboard-engine
```

When used as a workspace dependency in the [ink-cartridge](https://github.com/BAIGAOa/ink-cartridge) monorepo:

```json
{
  "dependencies": {
    "@cartridge-engine/keyboard-engine": "*"
  }
}
```

## Core Concepts

- [KeyboardEngine](#keyboardengine)
- [9-Stage Pipeline](#9-stage-pipeline)
- [Layer System](#layer-system)
- [Focus Targets](#focus-targets)
- [Custom Processors](#custom-processors)
- [Composition Engine](#composition-engine-flag-preposition-key-combinations)

### KeyboardEngine

The engine centers on a single `KeyboardEngine` instance. It owns all mutable keyboard state — bindings, layers, focus targets, global keys, modes, conditions, and the processor pipeline — and interacts with the host framework through two key methods: `sync()` and `processKey()`.

```ts
import { KeyboardEngine } from '@cartridge-engine/keyboard-engine';

const engine = new KeyboardEngine({
  modes: ['normal', 'insert'],
  defaultMode: 'normal',
  normalizeKeyNames: (input, key) => {
    // Framework-specific key name normalization
  },
});

// Sync state on every render
engine.sync({
  pagePath: ['app'],
  layers: [],
  modalLayers: [],
});

// Handle key events
useInput((input, key) => engine.processKey(input, key));
```

### 9-Stage Pipeline

Key events flow through each processor in priority order. The first processor that returns `true` (event consumed) stops the chain:

| Priority | Stage | Processor ID | Description |
|----------|-------|-------------|-------------|
| 0 (highest) | Modal intercept | `modal` | Active modal layer; blocks all lower events unless allowed |
| 1 | Composition (layer phase) | `composition-overlay` | Flag-preposition composition chains with `affectOverlay: true` |
| 2 | Global Sequence (layer phase) | `global-sequence-overlay` | Global multi-key sequences with `affectLayer: true` |
| 3 | Global Key (layer phase) | `global-key-overlay` | Global single keys with `affectLayer: true` |
| 4 | Layer broadcast | `layer` | All active elements on each layer receive the event (broadcast) |
| 5 | Composition (page phase) | `composition-screen` | Flag-preposition composition chains with `affectOverlay: false` |
| 6 | Global Sequence (page phase) | `global-sequence-screen` | Global multi-key sequences with `affectLayer: false` |
| 7 | Global Key (page phase) | `global-key-screen` | Global single keys with `affectLayer: false` |
| 8 (lowest) | Screen stack | `screen-stack` | Screen stack top-to-bottom; stops on first consumer |

### Layer System

The host framework pushes three kinds of state into the engine with `sync()`:

- `pagePath` — the screen stack, from root to the current screen
- `layers` — element layers displayed above the current screen
- `modalLayers` — modal layers, which always take keyboard priority over layers and pages

Each `KeyboardLayer` declares:

```ts
interface KeyboardLayer {
  layerId: string;          // Unique layer ID
  elements: string[];       // Element IDs rendered on this layer
  activeElements: string[]; // Elements that currently receive keyboard events
}
```

Every registered element owns an `ElementKeyboard` containing:

- **bindings** — registered key bindings
- **penetrationKeys** — keys marked as transparent (pass through to lower layers)
- **stoppedKeys** — keys blocked from propagating downward
- **allowedKeys** — keys allowed through the modal barrier (modal layers only)
- **focusTargets** — named focus targets (independent binding namespaces)
- **sequences** — multi-key sequence bindings

### Focus Targets

Focus targets allow multiple controls on the same screen (inputs, lists, menus) to maintain independent key bindings. Navigate with Tab / Shift+Tab, or programmatically via `focusSet` / `focusNext` / `focusPrev`.

### Custom Processors

The pipeline is ordered by processor `weight` — higher runs first, ties keep registration order. Built-in stages use the default weights exported as `builtinProcessorWeights`. Insert custom processors via `addProcessor` with an explicit `weight`, or position them by index / before/after a named processor as convenience sugar. Stages can be reordered at runtime with `setProcessorWeight`.

### Composition Engine (Flag-Preposition Key Combinations)

Beyond simple key→action and key-sequence→action mappings, the engine supports a **flag-preposition combination system** via the `CompositionEngine`. This allows declarative multi-key chord patterns where each key declares:

- **flag** — What this key _is_ (its identity type). The flag is automatically registered if not already known.
- **needs** — What flag(s) the _preceding_ key must have. If the preceding flag doesn't match, the key is discarded.
- **optional** — When `true`, the key can also serve as the **head** (first key) of a combination. If it's not the head, the `needs` constraint still applies.

This creates a grammar-based key dispatch model: keys declare their identity and their dependencies, and the engine resolves valid combinations by matching flag chains.

```ts
interface CompositionKey<TComponent = unknown, TValue = unknown> {
  key: string;                   // Trigger key name (e.g. "a", "ctrl+x")
  flags: { need: string; become: string }[]; // Dependent flag table
  needs: string[];               // Required preceding flag(s)
  alternativeFlag: string;       // Default flag for this key
  optional?: boolean;            // Can this key start a combination?
  timeout?: number;              // Max ms between keys in the combination
  exclusive?: boolean;           // Silently consume mismatched keys mid-sequence
  execute?: (ctx: CompositionContext<TValue>) => CompositionContext<TValue> | null;
  when?: (() => boolean) | string;
  mode?: string;
  category?: TComponent[] | "*";
  affectOverlay?: boolean;       // Layer phase (true) or page phase (false)
  executeWhenNoOverlay?: boolean;
  SwallowKeyWhenChainInterrupted?: boolean;
  undoAction?: undo<TValue>;
  isEndKey?: string[];
}

interface CompositionContext<T = unknown> {
  value: T;                     // Accumulated context value
  lastFlag: string | null;      // Flag of the previous key (null for head)
  steps: string[];              // Keys executed in the current combination
}
```

#### How It Works

The engine resolves flag chains in three phases:

1. **Resolution** — `resolveCompositionKey()` selects the best-matching `CompositionKey` from the mapping table, preferring entries whose `needs` match `lastFlag`, then by modifier specificity (`ctrl+s` over `s`), then by stricter contracts (longer `needs` lists).

2. **Pending chains** — When a head key matches, the engine enters a pending state (`CompositionPending`) with a configurable timeout. Subsequent keys advance the chain; the first non-matching key either cancels the chain (default) or is silently consumed (when `exclusive: true`).

3. **Execution** — Each key's `execute()` closure receives the current `CompositionContext` and returns the next one. When `execute()` returns `null`, the chain terminates. The pipeline processors (`composition-overlay` and `composition-screen`) integrate the engine into the 9-stage keyboard pipeline.

#### API

| Method | Description |
|--------|-------------|
| `registryCompositionKey(entry)` | Register a composition key entry |
| `removeCompositionKey(key)` | Remove all entries for a given key |
| `clearAllCompositionKeys()` | Remove every registered composition key |
| `updateCompositionKey(key, flag, updates)` | Update a registered entry identified by key + flag |
| `hasPending()` | Whether an active pending chain exists |
| `getContext()` | Get a shallow copy of the current composition context |
| `abort()` | Cancel the current pending chain immediately (now records history before clearing) |
| `undo(steps?, options?)` | Undo completed sequences by running each key's undoAction in reverse |
| `bufferedCount()` | Number of sequences available for undo |
| `clearBuffers()` | Clear all undo history |
| `setValueSchema(schema)` | Set or replace the runtime type guard schema |
| `start(ctx, affectOverlay)` | Entry point called by pipeline processors |

## API Reference

### `new KeyboardEngine(props: EngineProps)`

Creates an engine instance.

```ts
interface EngineProps {
  modes?: string[];
  defaultMode?: string;
  processors?: KeyboardProcessorProps[];
  normalizeKeyNames: (input: string, key: unknown) => string[];
}
```

### `engine.sync(state)`

Pushes host-framework state into the engine. Call on every render.

```ts
engine.sync({
  pagePath: TComponent[],
  layers: KeyboardLayer[],
  modalLayers: KeyboardLayer[],
});
```

`KeyboardLayer` is exported from `@cartridge-engine/keyboard-engine`:

```ts
interface KeyboardLayer {
  layerId: string;
  elements: string[];
  activeElements: string[];
}
```

### `engine.processKey(input, key)`

Processes a single keyboard event through the pipeline. Returns `true` if consumed.

### Public Methods

#### Key Bindings

| Method | Description |
|--------|-------------|
| `boundKeyboard(keys, handler, options?)` | Bind single or multiple keys |
| `boundSequence(keys, handler, options?)` | Bind a multi-key sequence |
| `penetration(keys, options?)` | Mark keys as transparent (pass-through) |
| `stop(keys, options?)` | Block keys from propagating downward |
| `allowModal(keys, options?)` | Allow keys through the modal barrier |

#### Global Keys & Sequences

| Method | Description |
|--------|-------------|
| `globalKeys(entries, options?)` | Register global key bindings |
| `globalSequence(entries, options?)` | Register global multi-key sequences |
| `getGlobalKeys()` | Get a shallow copy of all registered global key entries |
| `getGlobalSequences()` | Get a shallow copy of all registered global sequence entries |
| `getGlobalPendingSequence()` | Get the full pending global sequence state, or null |
| `thereGlobalQueueWaiting(sync?)` | Check whether a global sequence is pending (boolean). Optional `sync` callback notifies the host framework to re-render after each key event. |
| `currentScreenHasSequenceWaiting(sync?)` | Check whether the current owner's layer has a pending sequence (boolean). Optional `sync` callback notifies the host framework to re-render after each key event. |

#### Focus Management

| Method | Description |
|--------|-------------|
| `focusSet(focusId)` | Activate a named focus target |
| `focusNext()` | Move focus to the next target |
| `focusPrev()` | Move focus to the previous target |
| `focusCurrent()` | Get the currently active focus target id |
| `focusUnregister(focusId)` | Remove a focus target |
| `subscribeFocus(listener)` | Subscribe to focus changes |

#### Modes & Conditions

| Method | Description |
|--------|-------------|
| `addMode(mode)` | Register a mode name |
| `removeMode(mode)` | Remove a registered mode name |
| `setMode(mode)` | Switch to a specific mode |
| `nextMode()` | Cycle to the next mode |
| `prevMode()` | Cycle to the previous mode |
| `getCurrentMode()` | Get the active mode |
| `addCondition(id, defaultVal)` | Register a named condition |
| `removeCondition(target)` | Remove a registered condition |
| `setCondition(target, value)` | Update a condition value |

#### Shortcut & Sequence Operations

| Method | Description |
|--------|-------------|
| `defineShortcutAction(entries)` | Register shortcut actions in bulk |
| `defineSequenceAction(entries)` | Register sequence actions in bulk |
| `addAction(entry)` | Register a single shortcut action |
| `addSequenceAction(entry)` | Register a single sequence action |
| `removeAction(actionId)` | Remove a registered shortcut action |
| `hasAction(actionId)` | Check if a shortcut action is registered |
| `clearShortcutOperations()` | Clear all registered shortcut operations |
| `removeSequenceAction(sequenceActionId)` | Remove a registered sequence action |
| `hasSequenceAction(sequenceActionId)` | Check if a sequence action is registered |
| `clearSequenceOperations()` | Clear all registered sequence operations |
| `modifyAction(actionId, keys)` | Modify the default keys of an existing shortcut action |
| `modifySequenceAction(actionId, keys, timeout?)` | Modify the keys and timeout of an existing sequence action |

#### Pipeline Management

| Method | Description |
|--------|-------------|
| `addProcessor(processor, options?)` | Insert a custom processor (by weight, or index/before/after sugar) |
| `removeProcessor(processorId)` | Remove a processor |
| `getProcessors()` | Get the processor list |
| `resetProcessors()` | Reset to the default pipeline |
| `kickProcessor(id)` | Temporarily disable a processor (`active: false`) |
| `activeProcessor(id)` | Re-enable a disabled processor |
| `setProcessorWeight(id, weight)` | Reassign a processor's weight and re-sort the pipeline |

#### Modal Hooks

| Method | Description |
|--------|-------------|
| `useModalMissListener(cb, options?)` | Subscribe to unhandled modal keystrokes |

#### Layer Lifecycle

| Method | Description |
|--------|-------------|
| `readLayer(owner)` | Read-only layer lookup |
| `pushOwner(owner)` | Push an owner onto the stack (for layer/modal-layer binding attribution) |
| `popOwner(owner)` | Remove the most recent matching owner from the stack |
| `cleanLayers()` | Remove layers for screens no longer in the path |
| `cleanOverlayLayers()` | Remove element keyboards for layers no longer displayed |
| `cleanModalLayers()` | Remove element keyboards for modal layers no longer displayed |

#### Misc

| Method | Description |
|--------|-------------|
| `enableWildcardPriority()` | Enable wildcard `*` priority mode (reference-counted, returns disable function) |

#### Composition Engine

| Method | Description |
|--------|-------------|
| `registryCompositionKey(entry)` | Register a composition key entry |
| `removeCompositionKey(key)` | Remove all composition entries for a given key |
| `clearAllCompositionKeys()` | Remove every registered composition key |
| `updateCompositionKey(key, flag, updates)` | Update a registered composition entry |
| `hasPendingComposition()` | Whether a composition chain is currently pending |
| `getCompositionContext()` | Get a copy of the current composition context |
| `abortComposition()` | Cancel the current composition chain immediately (now records history) |
| `undoComposition(steps?, options?)` | Undo completed composition sequences |
| `bufferedCompositionCount()` | Number of sequences available for undo |
| `clearCompositionBuffers()` | Clear all undo history |
| `subscribeComposition(fn)` | Subscribe to composition state changes (returns unsubscribe) |
| `getLastCompositionEvent()` | Return the most recent CompositionEvent |
| `setValueSchema(schema)` | Set or replace the runtime type guard schema |

Access the underlying `CompositionEngine` instance directly via the `composition` getter for advanced use.

### Sequence State Queries

While a multi-key sequence is in progress, the engine can report its pending state:

- **Global sequences** (registered via `globalSequence()`) use an engine-level pending state. The first matching key starts the pending state; subsequent keys complete or cancel it.
- **Local sequences** (registered via `boundSequence()`) use each layer's own pending state, scoped to the current page, layer, or modal layer.

| Method | Scope | Returns |
|--------|-------|---------|
| `getGlobalPendingSequence()` | Engine | `GlobalPendingSequence \| null` — full state including remaining keys, timeout, and handler |
| `thereGlobalQueueWaiting(sync?)` | Engine | `boolean` — lightweight yes/no, equivalent to `getGlobalPendingSequence() !== null`. Optional `sync` callback triggers after each key event so the host framework can re-render. |
| `currentScreenHasSequenceWaiting(sync?)` | Current owner | `boolean` — `true` if the current owner's layer has a pending `boundSequence`. Throws if there is no current owner. Optional `sync` callback triggers after each key event so the host framework can re-render. |

#### Best Practice

```ts
// Guard navigation while a local sequence is in progress
if (engine.currentScreenHasSequenceWaiting()) {
  return; // let the sequence complete first
}

// Defer work while a global sequence is pending
if (engine.thereGlobalQueueWaiting()) {
  return;
}

// Inspect the pending global sequence for debug/tooltip purposes
const pending = engine.getGlobalPendingSequence();
if (pending) {
  console.log(`Waiting for key ${pending.nextIndex + 1}/${pending.sequences.length}`);
}
```

## API Documentation

See [keyboard-engine API docs](https://cartridgebox.art/engine/) for the typedoc-generated API reference — every public class, method, and type is documented from its JSDoc (including usage examples). Run `npm run docs` from the repo root to regenerate.

### Quick Example: ink-cartridge (React)

```tsx
import { KeyboardProvider, useKeyboard } from 'ink-cartridge';

function App() {
  return (
    <KeyboardProvider modes={['normal', 'insert']}>
      <MyScreen />
    </KeyboardProvider>
  );
}

function MyScreen() {
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(['ctrl+s'], () => save());
  }, []);

  return <Text>Press Ctrl+S to save</Text>;
}
```

### Vue

Adapt the engine to Vue's composition API with a reactive wrapper.

```ts
// useKeyboardEngine.ts
import { ref, onMounted, onUnmounted } from 'vue';
import { KeyboardEngine } from '@cartridge-engine/keyboard-engine';

export function useKeyboardEngine(options: {
  modes?: string[];
  defaultMode?: string;
}) {
  const engine = new KeyboardEngine({
    modes: options.modes,
    defaultMode: options.defaultMode,
    normalizeKeyNames: (input, key) => {
      // Adapt Vue's KeyboardEvent to normalized key names
      const e = key as KeyboardEvent;
      const names: string[] = [];
      if (e.key) names.push(e.key.toLowerCase());
      if (e.ctrlKey && e.key) names.push(`ctrl+${e.key.toLowerCase()}`);
      if (e.metaKey && e.key) names.push(`meta+${e.key.toLowerCase()}`);
      return names;
    },
  });

  const currentMode = ref(engine.getCurrentMode());

  return {
    engine,
    currentMode,
    sync: (state: Parameters<typeof engine.sync>[0]) => engine.sync(state),
    processKey: (input: string, key: KeyboardEvent) => engine.processKey(input, key),
  };
}
```

```vue
<!-- MyComponent.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useKeyboardEngine } from './useKeyboardEngine';

const { engine, sync, processKey } = useKeyboardEngine({
  modes: ['normal', 'insert'],
});

sync({
  pagePath: ['my-screen'],
  layers: [],
  modalLayers: [],
});

const onKeyDown = (e: KeyboardEvent) => processKey(e.key, e);

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));

const unbind = engine.boundKeyboard(['ctrl+s'], () => {
  console.log('Save triggered');
});
</script>
```

### Svelte

Wrap the engine in a Svelte store for reactive keyboard state.

```ts
// keyboardStore.ts
import { writable } from 'svelte/store';
import { KeyboardEngine } from '@cartridge-engine/keyboard-engine';

function createKeyboardEngine() {
  const engine = new KeyboardEngine({
    modes: ['normal', 'insert'],
    normalizeKeyNames: (input, key) => {
      const e = key as KeyboardEvent;
      const names: string[] = [];
      if (e.key) names.push(e.key.toLowerCase());
      if (e.ctrlKey && e.key) names.push(`ctrl+${e.key.toLowerCase()}`);
      if (e.metaKey && e.key) names.push(`meta+${e.key.toLowerCase()}`);
      return names;
    },
  });

  const mode = writable<string | null>(engine.getCurrentMode());

  engine.sync({
    pagePath: ['app'],
    layers: [],
    modalLayers: [],
  });

  return { engine, mode };
}

export const keyboard = createKeyboardEngine();
```

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { keyboard } from './keyboardStore';

  function handleKeydown(e: KeyboardEvent) {
    keyboard.engine.processKey(e.key, e);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  $: currentMode = $keyboard.mode;
</script>

<div>Current mode: {currentMode}</div>
```

### Standalone (no framework)

Use the engine directly with raw Node.js `readline` or TTY streams.

```ts
import { KeyboardEngine } from '@cartridge-engine/keyboard-engine';
import * as readline from 'node:readline';

const engine = new KeyboardEngine({
  normalizeKeyNames: (input, key) => {
    if (key.name === 'return') return ['return'];
    if (key.name === 'escape') return ['escape'];
    if (key.name === 'tab') return ['tab'];
    if (key.ctrl && key.name) return [`ctrl+${key.name}`];
    return [key.name ?? input];
  },
});

engine.sync({
  pagePath: ['app'],
  layers: [],
  modalLayers: [],
});

engine.boundKeyboard(['ctrl+c'], () => {
  console.log('Goodbye!');
  process.exit(0);
});

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on('keypress', (_input, key) => {
  engine.processKey(_input ?? '', key);
});
```

## Architecture Diagram

```
┌────────────────────────────────────────────┐
│                KeyboardEvent                │
└──────────────────┬─────────────────────────┘
                   ▼
          ┌──────────────┐
          │ ① Modal       │ ← Active modal
          └──────┬────────┘    allowModal() can release keys
                 ▼
          ┌──────────────┐
          │ ② Composition │ ← affectOverlay: true (layer phase)
          └──────┬────────┘    Flag-preposition chains
                 ▼
          ┌──────────────┐
          │ ③ GlobalSeq   │ ← affectLayer: true (layer phase)
          └──────┬────────┘
                 ▼
          ┌──────────────┐
          │ ④ GlobalKey   │ ← affectLayer: true (layer phase)
          └──────┬────────┘
                 ▼
          ┌──────────────┐
          │ ⑤ Layer       │ ← Broadcast to all active layer elements
          └──────┬────────┘
                 ▼
          ┌──────────────┐
          │ ⑥ Composition │ ← affectOverlay: false (page phase)
          └──────┬────────┘    Flag-preposition chains
                 ▼
          ┌──────────────┐
          │ ⑦ GlobalSeq   │ ← affectLayer: false (page phase)
          └──────┬────────┘
                 ▼
          ┌──────────────┐
          │ ⑧ GlobalKey   │ ← affectLayer: false (page phase)
          └──────┬────────┘
                 ▼
          ┌──────────────┐
          │ ⑨ ScreenStack │ ← Top → bottom, stops on consume
          └──────────────┘
```


## See Also

- [ink-cartridge](https://github.com/BAIGAOa/ink-cartridge) — React Ink component kit for building terminal UIs, built on this engine.

## License

MIT

## Author

BAIGAO
