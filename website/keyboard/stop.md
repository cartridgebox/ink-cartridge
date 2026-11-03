# Stopping key propagation with `stop`

`stop()` registers a set of **stop keys** on the current layer: once such a key reaches that layer, it does not propagate any further down — even when no binding handles it.

```typescript
stop(keys: string[], options?: StopOptions): () => void
```

Call it inside a screen component or a layer element. It returns a function that removes the stop rule.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | A stop only matters when no binding matched |
| [Layer Basics](/screen/layer-base) | `stop` acts on the current layer |

## Evaluation order within a layer

| Order | Mechanism | Result when it matches |
|---|---|---|
| 1 | Binding — `boundKeyboard` | The event is handled; propagation ends |
| 2 | Penetration — `penetration` | The key is released and passed to the layer below |
| 3 | Stop — `stop` | The key is swallowed at this layer and goes no further |

`stop` is the fallback: it only takes effect when no binding matched and the key was not penetrated. Two boundaries are worth knowing:

- **Stopping does not affect the in-layer broadcast.** Active elements still get the key first (priority handlers, then ordinary bindings); `stop` only cuts the propagation to lower layers.
- **`stop` takes priority over `penetration`.** When the same key is both penetrated and stopped on the same layer, the stop wins — the key does not propagate.

## Basic usage

Stop the arrow keys on a screen so lower screens in the stack never see them:

```tsx
const { stop } = useKeyboard()

useEffect(() => stop(['up', 'down', 'left', 'right']), [stop])
```

The wildcard `"*"` stops every key:

```tsx
useEffect(() => stop(['*']), [stop])
```

## Conditional stops

`when` accepts a callback or a registered named condition. When it returns `false`, the rule is ignored and the key propagates as usual:

```tsx
useEffect(() => stop(['*'], { when: () => isEditing }), [stop, isEditing])
```

## Stopping by action id

`stopAction: true` treats `keys` as shortcut action IDs and resolves them to the keys the action currently has bound. Re-binding the action later moves the barrier with it:

```tsx
useEffect(() => stop(['submit', 'cancel'], { stopAction: true }), [stop])
```

## Scoping

```tsx
// Stop only while that focus target is active
useEffect(() => stop(['escape'], { focusId: 'searchInput' }), [stop])
```

Inside a layer element, `useKeyboard().stop()` injects `elementId` automatically — you never pass it by hand. Both `focusId` and `elementId` can also be given explicitly.

## Return value and errors

`stop()` returns an unbind function; return it from `useEffect` to clean up:

```tsx
useEffect(() => stop(['q']), [stop])
```

These cases throw:

| Case | Error |
|---|---|
| No active screen or layer (no owner) | `[keyboard-engine] stop() must be called inside a screen component or overlay.` |
| `stopAction: true` with an unregistered action or one without bound keys | Reports that the action is not registered or has no bound keys |

> Modal layers already intercept every key, so `stop` is rarely needed inside one.
