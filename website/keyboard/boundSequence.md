# Learning multi-key sequences with `boundSequence`

In the *Shortcuts & Actions* chapter we said multi-key sequences would get a dedicated chapter later — this is it. The key difference from a normal shortcut is simple: **a sequence only fires after you press several keys in a row**, and there's a time limit between presses.

By now you already know the focus system, focus groups, and binding attribution — this chapter assumes all of that and doesn't re-explain it. It focuses on the most common overload only: `boundSequence(keys, handler, options?)`.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | A sequence is still a form of binding |
| [Focus Groups](/keyboard/focus-group) | A sequence can be bound to a focus target |
| [Binding Attribution](/screen/binding-attribution) | Where you call a sequence decides where it lands |

## What is a sequence

Think of vim's `d d`: you delete by pressing `d` twice. After the first key, the engine doesn't fire immediately — it enters a "pending" state and waits for the remaining keys.

A sequence's full lifecycle:

1. Press the first key → enter the pending state, start the timer;
2. Press the second key within the timeout → the sequence matches and the handler runs;
3. Each matched key resets the timer;
4. If the timeout expires, or a mismatched key is pressed (with `exclusive: false`), the sequence is cancelled.

## Basic usage: `boundSequence(keys, handler, options?)`

The signature mirrors `boundKeyboard`, except `keys` is a whole sequence instead of a single key:

```typescript
boundSequence(
  keys: string[],                       // keys pressed in order — at least two
  handler: KeyHandler,                  // callback fired when the full sequence matches
  options?: SequenceOptions,            // all options below
): () => void
```

```tsx
const { boundSequence } = useKeyboard()

useEffect(() => {
  return boundSequence(["d", "d"], () => deleteItem())
}, [boundKeyboard])
```

Two basic rules:

- **A sequence needs at least two keys**: `boundSequence(["a"], ...)` throws `requires at least 2 keys in the sequence`;
- It returns an unbind function, cleaned up exactly like `boundKeyboard` (return it from a `useEffect`).

## Attribution and focus: identical to `boundKeyboard`

This point matters: **`boundSequence` is attributed exactly like `boundKeyboard`.**

- It resolves ownership through the same `getCurrentOwner()`, landing on the current owner's layer;
- With `elementId`, it lands on that layer element; with `focusId`, it **implicitly creates the focus target** (`getOrCreateFocusTarget`) and participates in focus routing — only the currently active focus's sequences are matched.

So every rule you learned in *Binding Attribution & the Owner Stack*, *Focus System*, and *Default groups and named groups* applies to sequences unchanged — we won't repeat them here.

## All options

`SequenceOptions` extends `BoundKeyboardOptions` and adds `timeout` and `exclusive`:

- `timeout` {number} Max gap between consecutive key presses (ms). **Default:** `500`.
- `exclusive` {boolean} On a mismatched key during a pending sequence: `false` cancels the sequence and lets the key fall through; `true` silently consumes it and keeps waiting. **Default:** `false`.
- `when` {(() => boolean) | string} Condition (function or named condition id). The sequence only starts and continues while this is `true`.
- `mode` {string} Only active in the given mode (modes must be registered first).
- `focusId` {string | FocusRef} Scope the sequence to a focus target / focus group; only matches while that target is active.
- `elementId` {string} Scope the sequence to a specific element on the current layer.
- `stopsWorkingAfterLayerAppearing` {boolean} Page bindings only: the sequence stops working once any layer is present.

### `timeout` and `exclusive`

These two are sequence-specific.

`timeout` controls how fast a "combination" must be — the timer starts on the first key and resets on every match:

```tsx
// g g fires within 700ms; the default is 500ms
boundSequence(["g", "g"], () => jumpToTop(), { timeout: 700 })
```

`exclusive` decides what happens when a mismatched key is pressed while pending:

```tsx
// default false: after g, a wrong key cancels the sequence and falls through
boundSequence(["g", "g"], () => jumpToTop())

// true: after w, a wrong key is silently consumed — pressing w again still locks
boundSequence(["w", "w"], () => lock(), { exclusive: true })
```

### `when`, `mode`, `focusId`, `elementId`, `stopsWorkingAfterLayerAppearing`

These behave exactly like their `boundKeyboard` counterparts, just applied to sequences:

```tsx
// only active in insert mode
boundSequence(["d", "d"], () => deleteItem(), { mode: "insert" })

// only responds while the condition is true
boundSequence(["c", "c"], () => copy(), { when: () => hasSelection })

// scoped to a field inside the form focus group; matches only while that field is active
boundSequence(["e", "e"], () => edit(), { focusId: { group: "form", focusId: "name" } })
```

### About `times` / `once` / `observer`

`SequenceOptions` inherits `times`, `once`, and `observer` from `boundKeyboard` in its type, but **the sequence matching machinery does not handle them** — those three options have no effect on `boundSequence`. Use them with `boundKeyboard` only.

## Complete example

By now we can tie sequences into a **fully runnable** app — a "sequence console": the left panel lists the registered sequences, the right panel is a live event log. Every sequence is bound with `boundSequence(keys, handler, options?)`; `g g` raises `timeout`, and `w w` turns on `exclusive`. Save the code below as a `.tsx` file and run `npx tsx <file-name>.tsx`.

::: details Click to expand the full example (~120 lines)
```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
} from 'ink-cartridge';

function ConsoleScreen() {
  const { boundSequence } = useKeyboard();
  const [log, setLog] = useState<string[]>([]);

  const push = useCallback((msg: string) => {
    setLog((prev) => [msg, ...prev].slice(0, 6));
  }, []);

  useEffect(() => {
    // all use the basic form boundSequence(keys, handler, options?)
    const unDel = boundSequence(['d', 'd'], () => push('delete (d d)'));
    const unTop = boundSequence(['g', 'g'], () => push('goto top (g g)'), { timeout: 700 });
    const unHello = boundSequence(['c', 'c'], () => push('hello (c c)'), { timeout: 600 });
    const unLock = boundSequence(['w', 'w'], () => push('lock (w w)'), { exclusive: true });

    return () => { unDel(); unTop(); unHello(); unLock(); };
  }, [boundSequence, push]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* Title bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={2}>
        <Text bold color="cyan">SEQUENCE CONSOLE</Text>
        <Text dimColor>  ·  multi-key sequences with boundSequence</Text>
      </Box>

      {/* Two-column body: sequence list + event log */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        {/* Left: registered sequences */}
        <Box width={30} borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
          <Text bold underline color="cyan">Registered sequences</Text>
          <Box flexDirection="column" marginTop={1} gap={0}>
            <Text>▶ [d d] delete</Text>
            <Text dimColor>  [g g] goto top (timeout 700)</Text>
            <Text dimColor>  [c c] hello (timeout 600)</Text>
            <Text dimColor>  [w w] lock (exclusive)</Text>
          </Box>
        </Box>

        {/* Right: event log */}
        <Box flexGrow={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} paddingY={1}>
          <Text bold underline color="magenta">Event log</Text>
          <Box flexDirection="column" marginTop={1} gap={0}>
            {log.length === 0 && <Text dimColor>（no events yet）</Text>}
            {log.map((line, i) => (
              <Text key={i} color={i === 0 ? 'green' : undefined}>· {line}</Text>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Bottom bar: key hints */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={2}>
        <Text dimColor>
          d d delete · g g goto top · c c hello · w w lock · q quit
        </Text>
      </Box>
    </Box>
  );
}

registerComponent(ConsoleScreen, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(['q'], () => process.exit(0));
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={ConsoleScreen} fullScreen>
    <KeyboardProvider>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
```
:::

### Controls

| Key | Effect | Options |
|------|------|------|
| `d` `d` | delete | default (timeout 500, exclusive false) |
| `g` `g` | goto top | `timeout: 700` |
| `c` `c` | hello | `timeout: 600` |
| `w` `w` | lock | `exclusive: true` |
| `q` | quit | — |

### What you should observe

1. **A sequence must be typed "in one breath"**: pressing `d d` quickly deletes. Press one `d`, pause, then press again — past the timeout the sequence is cancelled and nothing happens. This is the clearest difference from a normal shortcut.

2. **Timeouts are configurable**: `g g` has a `700ms` timeout, more lenient than `d d`'s default `500ms` — you can pause a little longer between the two keys; `c c` is set to `600ms`.

3. **`exclusive` decides the fate of a wrong key**: `d d` is the default (`false`) — after `d`, a mismatched key cancels the sequence; `w w` sets `true` — after `w`, a wrong key is silently consumed and pressing `w` again still locks.

4. **Attribution and focus rules stay the same**: in this example the sequences are registered on the screen layer; switch to a `focusId`-scoped form and only the active focus target can match — exactly like `boundKeyboard`.
