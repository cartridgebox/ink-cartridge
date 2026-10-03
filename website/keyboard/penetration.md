# Passing keys through with `penetration`

`penetration()` marks a set of keys as **transparent** on the current layer: when such a key reaches that layer, the layer's own bindings are skipped and the key is passed on to the layers below.

Penetration is a **release**, not a block — the key is only let through, never consumed.

```typescript
penetration(keys: string[], options?: PenetrationOptions): () => void
```

Call it inside a screen component or a layer element. It returns a function that removes the transparency markers.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | `penetration` acts on the current layer |
| [Keyboard Events Between Layers](/screen/layer-keyboard) | Penetration changes exactly that inter-layer propagation |

## Where you register it decides how far it releases

| Registered in | Effect |
|---|---|
| A screen component | This screen's bindings skip the key; it goes on to lower screens in the stack |
| A layer element | The key becomes transparent for the **whole layer**: no element in it receives the key, and the key falls to lower layers, then to the screen |

The second row is easy to trip over: penetration rules are **layer-scoped**. As soon as any active element of a layer marks a key transparent, every other element of that layer loses the key too.

## Basic usage

Release the arrow keys on a screen so lower screens in the stack take over:

```tsx
const { penetration } = useKeyboard()

useEffect(() => penetration(['up', 'down', 'left', 'right']), [penetration])
```

The wildcard `"*"` releases every key — the layer stops intercepting anything:

```tsx
useEffect(() => penetration(['*']), [penetration])
```

## Conditional penetration

`when` accepts a callback or a registered named condition. When it returns `false`, the marker is ignored and the layer handles the key as usual:

```tsx
useEffect(() => penetration(['tab'], { when: () => !isEditing }), [penetration])
```

## Scoping

```tsx
// Release only while that focus target is active
useEffect(() => penetration(['escape'], { focusId: 'searchInput' }), [penetration])
```

Inside a layer element, `useKeyboard().penetration()` injects `elementId` automatically — you never pass it by hand.

## Relation to `stop`

Within a layer the order is **bindings → penetration → stop**, so penetration pulls the key out before bindings are matched. But **a stop outranks penetration**: when the same key is both penetrated and stopped on the same layer, `stop` wins and the key does not propagate. See [Stopping key propagation](/keyboard/stop).

## Options

- `focusId` {string | FocusRef} Release only while that focus target is active; `FocusRef` is `{ group, focusId }`.
- `when` {(() => boolean) | string} Condition guard — callback or registered named condition id.
- `elementId` {string} Which element the rule applies to; injected by the hook inside layer elements.

## Return value and errors

`penetration()` returns an undo function; return it from `useEffect` to clean up:

```tsx
useEffect(() => penetration(['q']), [penetration])
```

With no active screen or layer (no owner) it throws:

```
[keyboard-engine] penetration() must be called inside a screen component or overlay.
```

> Releasing keys through a modal layer is a different mechanism — see [Passing keys through the modal barrier](/screen/allow-modal).
