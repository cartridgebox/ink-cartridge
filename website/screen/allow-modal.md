# Passing keys through the modal barrier with `allowModal`

In the previous chapter, we learned how to deactivate and activate keyboard response of elements inside modal layers. In this chapter, we'll learn about `allowModal`: letting specific keys pass through the modal layer's keyboard barrier down to the ordinary layers or screen below.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | `allowModal` opens the barrier that chapter describes |

## Why you need to let keys through

While a modal layer is open, keys it doesn't handle are swallowed by the barrier. Most of the time that's the desired behavior — when a confirm box is open, the user shouldn't be able to operate the UI underneath. But some scenarios need exceptions: a help popup might want to let arrow keys scroll the page below; a settings popup might want a shortcut to reach the main UI directly.

`allowModal` declares exactly these exceptions: **add specific keys to an allowlist so they pass through the barrier when the modal layer doesn't handle them**.

## Using `allowModal`

```typescript
allowModal(keys: string[], options?: AllowModalOptions): () => void
```

- `keys` — the array of key names to allow through;
- `options` — optional config, see the table below;
- Return value — an unbind function that removes the allow rule when called.

The optional fields of `AllowModalOptions`:

- `[elementId]` {string} The element the allow rule applies to. Auto-injected by `useKeyboard()` when called inside a modal element; usually no need to pass it.
- `[focusId]` {string | FocusRef} Scopes the allow rule to a named focus target; the rule only takes effect within that target. A string refers to a focus id in the default focus layer; the object form `{ group, focusId }` scopes it to a named focus group.
- `[when]` {(() => boolean) | string} A condition — a function or a registered condition id. When it's `false`, the allow rule is ignored and the key stays blocked by the barrier.

`allowModal` must be called inside a modal layer's component. The `allowModal` from `useKeyboard()` attributes the rule to the current modal layer's element automatically — no need to pass `elementId` by hand:

```tsx
// Allow t: when the modal layer doesn't handle t, it passes through the barrier to the UI below
const unallow = allowModal(['t']);
```

Here's a minimal runnable example: Home binds `t` / `x` to log lines; press `1` to open a help popup that allows `t` through, while the barrier still blocks `x`.

```tsx
import React, { useContext, useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ModalLayerElementContext,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
  useScreenSystem,
} from 'ink-cartridge';

function Home() {
  const { openModalLayer, applyElementToModalLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const open = boundKeyboard('1', () => {
      openModalLayer('help', 100);
      applyElementToModalLayer('help', {
        element: HelpModal,
        elementId: 'help-body',
      });
    });
    const onT = boundKeyboard('t', () => setLog((l) => [...l, 'Page received t']));
    const onX = boundKeyboard('x', () => setLog((l) => [...l, 'Page received x']));
    return () => {
      open();
      onT();
      onX();
    };
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>Press 1 to open the help popup · t is allowed · x is swallowed</Text>
      {log.map((line, i) => (
        <Text key={i} dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
registerComponent(Home, {});

function HelpModal() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard, allowModal } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);

  useEffect(() => {
    if (!ctx) return;
    // Allow t through the barrier to the screen below
    const unallow = allowModal(['t']);
    const close = boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
    return () => {
      unallow();
      close();
    };
  }, [allowModal, boundKeyboard, closeModalLayer, ctx]);

  return (
    <Box
      position="absolute"
      top={4}
      left={40}
      width={40}
      height={6}
      borderStyle="round"
      borderColor="magenta"
      backgroundColor="black"
    >
      <Text>❓ Help (press return to close)</Text>
    </Box>
  );
}

render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>
);
```

Run it:

- Press `1` to open the help popup;
- Press `t`: the popup doesn't handle `t`, but it's on the allowlist → passes through the barrier → Home receives `t` and the log shows "Page received t";
- Press `x`: the popup doesn't handle `x` and it's not on the allowlist → swallowed by the barrier → Home never receives `x` and the log doesn't show "Page received x";
- Press `return` to close the popup.

## The semantics of letting keys through

Letting keys through follows two rules:

1. **The modal layer's own handlers take priority.** If an element inside the modal layer handles a key (for example, the popup binds `return`), the key is consumed by the modal layer and won't pass through even if it's on the allowlist.
2. **Only "unhandled" allowed keys pass through.** For a key to cross the barrier, both conditions must hold: the modal layer didn't handle it, and it's on the allowlist.

## Summary

| Method | Purpose |
| --- | --- |
| `allowModal(keys, options?)` | Adds specific keys to the allowlist so they pass through the barrier when the modal layer doesn't handle them |
| Returned unbind function | Call it to remove the allow rule |

## Caveats

1. **`allowModal` must be called inside a modal layer's component.** Calling it elsewhere throws.
2. **The modal layer's own handlers take priority over the allowlist.** A key handled by the modal layer won't pass through the barrier.
3. **The `when` condition.** When `when` is provided, the allow rule only takes effect while the condition is `true`; when `false`, the key stays blocked by the barrier.
4. **Allowing a key through doesn't skip the modal layer.** It means "when the modal layer doesn't handle this key, let it fall through to the UI below" — the key still passes through the modal layer first.
