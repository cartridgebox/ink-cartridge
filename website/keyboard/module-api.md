# Driving the engine without React: the module-level keyboard API

Every keyboard operation has two entry points: the **hook** version from `useKeyboard()`, and a **module-level** version imported directly from `ink-cartridge`. The module-level functions forward to the currently mounted `KeyboardEngine`, so operations that do not need React context can be driven from module scope.

```tsx
import { addAction, setMode, addProcessor } from "ink-cartridge";
```

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | Understanding owner attribution is what tells the two groups apart |
| [Binding Attribution & the Owner Stack](/screen/binding-attribution) | `withOwner` manipulates exactly this owner stack |

## Why a module-level API

The hook version resolves an owner (the current screen / layer element) from React context, so it can only be called inside the render tree. But a set of operations has no owner at all — registering a shortcut action, switching modes, adjusting a processor's weight. Forcing those into some component's effect is awkward, and sometimes impossible: module-top initialization code has no component.

The module-level API is for exactly those: register every action, processor, and mode once at module top level on startup, with no component to attach to.

## `getEngine` and `withOwner`

`getEngine()` returns the **most recently mounted** engine; it throws when no `KeyboardProvider` is mounted. The engine is registered during **render** (not in an effect), so a child's effect can already reach it.

`withOwner(owner, fn)` pushes an owner onto the engine's owner stack for the duration of `fn` and pops it in a `finally` — so the **owner-requiring** methods on `getEngine()` can also be called from module scope.

```tsx
import { getEngine, withOwner } from "ink-cartridge";

// No owner needed: call directly
getEngine().setMode("normal");

// Owner needed: wrap the call
withOwner(MyPage, () => getEngine().boundKeyboard(["a"], handler));
```

## What can be called module-level

| | Methods | Entry point |
|---|---|---|
| Owner-independent | global keys, modes, conditions, actions, processors, composition, mapping, mouse regions | module-level functions, or `useKeyboard()` |
| Owner-scoped | `boundKeyboard`, `boundSequence`, `penetration`, `stop`, `allowModal`, the `focus*` family | `useKeyboard()`, or `withOwner` around `getEngine()` |

Owner-scoped methods resolve a layer / page owner from context, so they **have no module-level form**.

> The screen system's navigation functions are module-level too: `skip`, `back`, and `gotoScreen` can be imported straight from `ink-cartridge`; for the hook form see [Navigation](/screen/navigation).

## Categorized index

Every function below is imported directly from `ink-cartridge` and behaves identically to the same-named `useKeyboard()` method:

| Category | Module-level functions |
|---|---|
| Global keys | `globalKeys`, `getGlobalKeys`, `globalSequence`, `getGlobalSequences`, `getGlobalPendingSequence`, `thereGlobalQueueWaiting`, `currentScreenHasSequenceWaiting` |
| Modes | `getCurrentMode`, `addMode`, `removeMode`, `setMode`, `nextMode`, `prevMode` |
| Named conditions | `addCondition`, `setCondition`, `removeCondition` |
| Shortcut actions | `defineShortcutAction`, `addAction`, `hasAction`, `removeAction`, `modifyAction`, `clearShortcutOperations` |
| Sequence actions | `defineSequenceAction`, `addSequenceAction`, `hasSequenceAction`, `removeSequenceAction`, `modifySequenceAction`, `clearSequenceOperations` |
| Processors | `addProcessor`, `removeProcessor`, `getProcessors`, `resetProcessors`, `activeProcessor`, `kickProcessor`, `setProcessorWeight` |
| Composition | `registryCompositionKey`, `removeCompositionKey`, `clearAllCompositionKeys`, `hasPendingComposition`, `getCompositionContext`, `abortComposition`, `updateCompositionKey`, `setValueSchema`, `undoComposition`, `bufferedCompositionCount`, `clearCompositionBuffers`, `subscribeComposition`, `getLastCompositionEvent` |
| Mapping keys | `addMapping`, `removeMappingKey`, `removeMapping`, `subscribeMapping`, `getLastMappingEvent` |
| Mouse regions | `registerMouseRegion`, `unregisterMouseRegion`, `getHoveredMouseRegion` |
| Other | `readLayer`, `subscribeFocus`, `enableWildcardPriority` |

Each operation's semantics live in its own chapter — this table is just a list of their module-level entry points.

## Usage

Register at module top level (outside any component) so it is live on startup:

```tsx
import { addAction, addCondition, setMode } from "ink-cartridge";

addCondition("isEditing", false);
addAction({ actionId: "save", action: () => saveDoc(), keys: ["ctrl+s"] });
setMode("normal");
```

They also work inside any effect or event callback, with the same behavior as the hook version:

```tsx
useEffect(() => {
  setMode("normal");
  return () => setMode("insert");
}, []);
```

## Return value and errors

- Module-level functions return exactly what their `useKeyboard()` counterparts return: most are `void`, but several return `boolean` (`addMode`, `removeMode`, `setMode`, `addMapping`, `removeMappingKey`, `removeMapping`, `addAction`, `hasAction`, `activeProcessor`, `kickProcessor`, `setProcessorWeight`, …), and the read functions return a snapshot (e.g. `getGlobalKeys`).
- With no `KeyboardProvider` mounted they throw:

  ```
  [ink-cartridge] No KeyboardEngine is mounted. Render a <KeyboardProvider> before calling getEngine().
  ```

> Imported from `@cartridge-engine/keyboard-engine`, `clearShortcutOperations` is a no-op (keyboard state lives per instance); the module-level one exported by `ink-cartridge` forwards to the mounted engine — do not confuse the two.
