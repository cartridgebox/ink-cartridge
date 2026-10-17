# Driving keyboard focus from the mouse

A mouse region can turn the clicks or hovers it receives into keyboard focus changes. One component can then be selected by mouse or by keyboard, with both input paths converging on the same focus target.

The switches are three options: `clickOnFocus`, `enterOnFocus` and `leaveOffFocus`.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The link is established by `boundKeyboard`'s `ref` and `focusId` options |
| [Focus System](/keyboard/focus-system) | You need focus targets, `focusId` and `useFocusState` |
| [Binding Attribution](/screen/binding-attribution) | The link is recorded in the scope the caller belongs to, which decides where it lands |

## The mechanism: a table keyed by the ref object

Underneath, the link is a single table:

```typescript
type RegionFocusEntry = { focusId: string | FocusRef };
type RegionFocusMap = Map<RefObject<DOMElement | null>, RegionFocusEntry>;
```

**The key is the ref object itself** — not `regionId`, not an element id. That is the whole reason the same ref object is required: the lookup is by object identity, so a freshly created ref with identical contents still misses.

The table lives on the **page** and on every **layer / modal layer**, so it survives repeated re-renders of `CurrentScreen` instead of being rebuilt and cleared.

Registration and lookup each happen in their own scope, and the two have to land on the same table:

| Moment | Which table |
|---|---|
| `boundKeyboard({ ref, focusId })` records | The scope the call site belongs to |
| A mouse event looks up | The scope `useMouseRegion` belongs to |

Scope priority is **layer element > modal element > current page**. In practice the two calls sit in the same component and agree automatically; they only diverge when the binding is written on the screen while the ref comes from an element inside a layer.

## Establishing the link with one ref

Hand the **same object** returned by `useMouseRegion` to both `useMouseRegion` itself and `boundKeyboard`'s `ref` option:

```tsx
function FocusButton({ focusId }: { focusId: string }) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);

  const ref = useMouseRegion({
    onClick: () => activate(),
  });

  useEffect(() => {
    return boundKeyboard(['s'], () => activate(), { ref, focusId });
  }, [boundKeyboard, ref, focusId]);

  return (
    <Box ref={ref} borderStyle="round" borderColor={focused ? 'green' : 'gray'}>
      <Text>{focused ? '●' : '○'} press s or click</Text>
    </Box>
  );
}
```

The two hooks do different jobs and neither is optional:

- `useMouseRegion` measures the rect, hit-tests, and **reads** the table when an event arrives
- `boundKeyboard`'s `{ ref, focusId }` **writes** the table, while binding the key normally

Without `{ ref, focusId }` a click is just an ordinary callback; the focus never moves.

> `ref` must be an **object ref**, and the **same object**. A callback ref is rejected and falls back to an internal ref, silently losing the link — no warning, no error.

One ref can be shared by several bindings. Internally it is reference-counted, and the entry is only removed once the last registration is released:

```tsx
// Two bindings sharing one ref and one focusId
boundKeyboard(['s'], () => activate(), { ref, focusId });
boundKeyboard(['return'], () => activate(), { ref, focusId });
```

The unbind function `boundKeyboard` returns already folds "remove the binding" and "decrement the link count" into one idempotent call, so it can be handed straight to `useEffect` for cleanup.

## Execution order when an event fires

`useMouseRegion` does not register your callbacks verbatim — it wraps `onClick` / `onEnter` / `onLeave` so that the focus forwarding runs first and **your callback runs after**.

Focus is updated **synchronously** in the engine, so by the time your callback runs the engine already holds the new focus. The boolean returned by `useFocusState` in that component only catches up on the next render, though — to read the current focus from inside the callback, use `focusCurrent()`, which queries synchronously, rather than the `focused` variable from the current render.

| Callback | Order |
|---|---|
| `onClick` | `clickOnFocus` forwards focus → your `onClick` |
| `onEnter` | `enterOnFocus` forwards focus → your `onEnter` |
| `onLeave` | clears focus (conditions below) → your `onLeave` |

If the table has no entry for that ref, the forwarding returns immediately and does nothing. An unlinked region is therefore a safe no-op.

## `clickOnFocus`: switching focus on click

On by default, and the check is explicit — `undefined` counts the same as `true`:

```tsx
const ref = useMouseRegion({ onClick: () => setCount((n) => n + 1) });
```

Nothing above mentions `clickOnFocus`, yet a click still moves focus, provided the ref was registered somewhere with `{ ref, focusId }`. To keep clicks purely on the mouse callbacks, opt out explicitly:

```tsx
const ref = useMouseRegion(
  { onClick: () => setCount((n) => n + 1) },
  { clickOnFocus: false },
);
```

When the region sits inside a layer element, the forwarding also carries an **element scope** — the focus is set under `focusSet(focusId, { element })`, affecting only that element's bindings.

## `enterOnFocus` / `leaveOffFocus`: hovering drives focus

`enterOnFocus` is **off** by default; turning it on moves focus as soon as the mouse enters:

```tsx
const ref = useMouseRegion(
  { onEnter: () => setHovered(true), onLeave: () => setHovered(false) },
  { enterOnFocus: true },
);
```

`leaveOffFocus` decides whether leaving clears the focus. It defaults to `true`, but it **only participates when `enterOnFocus` is `true`**. That is deliberate: if leaving always cleared focus, a click-only region would lose the focus the user just clicked as soon as the cursor moved away. So a click-only region is completely unaffected by `leaveOffFocus`.

| `enterOnFocus` | `leaveOffFocus` | Behaviour |
|---|---|---|
| `false` | not consulted | Only clicks move focus |
| `true` | `true` (default) | Enter focuses, leave clears |
| `true` | `false` | Enter focuses, leave **keeps** it |

`leaveOffFocus: false` suits targets where hovering is a temporary preview but the focus must stay — a panel with a narrow edge the cursor easily slips off, for instance. All three modes are on display as the three panels of `mouse-hover-focus.tsx`.

Clearing on leave goes through `kickFocusGroup`, which **drops the focus that group currently holds** rather than restoring the previous one. Moving back in sets the focus again; there is no "restore the scene".

## Named groups

`focusId` can be written in the `FocusRef` form `{ group, focusId }` to attach the link to a named group:

```tsx
useEffect(
  () =>
    boundKeyboard(['s'], () => activate(), {
      ref,
      focusId: { group: 'nav', focusId: 'nav-item-1' },
    }),
  [boundKeyboard, ref],
);
```

Forwarding and clearing then take two different branches, which is worth noticing:

| Entry shape | Enter / click | Leave |
|---|---|---|
| `focusId` is a string | Sets focus (default group) | `kickFocusGroup()` — clears the default group |
| `focusId` is a `FocusRef` | Sets focus (named group) | `kickFocusGroup({ group })` — clears **that named group** |

In other words, leaving clears **whatever the whole group currently holds**, not strictly the one `focusId` you registered. If the same named group still holds other focus targets, they are dropped too. See [Default Groups and Named Groups](/keyboard/focus-group) for the multi-focus concept.

## The link also applies to `boundSequence`

`boundKeyboard` is not the only writer — `boundSequence(keys, actionId, { ref, focusId })` records the same entry. The difference only shows after a click moves the focus: only the region that holds the focus starts matching its sequence, so the same key pair can take a different branch per panel (see `mouse-sequence.tsx`).

## When the link does not work, check these four

The failure is silent, so confirm them in order:

1. **Is mouse support on?** — `<KeyboardProvider mouse>`, otherwise the region never receives events at all
2. **Is it the same ref object?** — `useMouseRegion` and `boundKeyboard` must receive the same reference; wrapper components have to forward it
3. **Is it a callback ref?** — a `(node) => {...}` form is rejected; it must be an object ref from `useRef` or `useMouseRegion`
4. **Do the scopes agree?** — the writing `boundKeyboard` and the reading `useMouseRegion` must land on the same table (same component is enough)
