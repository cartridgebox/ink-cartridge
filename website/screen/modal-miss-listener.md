# Listening for missed keys in a modal layer

In the previous chapter, we learned how to let keys through the modal barrier with `allowModal`. In this chapter, we'll learn about `useModalMissListener`: listening inside a modal layer for keys that aren't handled — the missed keys.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Modal Layer Keyboard Events](/screen/modal-layer-keyboard) | Missed keys are the ones the barrier swallows |
| [Passing Keys with allowModal](/screen/allow-modal) | The previous chapter |

## What a missed key is

While a modal layer is open, keys it doesn't handle are swallowed by the barrier. Most of the time we don't care about those keys, but some scenarios want to react when a key is swallowed — for example, showing a "key not bound" hint at the bottom of the popup, or counting the invalid keys the user pressed inside the modal layer.

`useModalMissListener` listens for exactly these missed keys: **register a callback inside a modal layer; it fires whenever a key is not handled by the modal layer**.

## Using `useModalMissListener`

```typescript
useModalMissListener(cb: ModalMissCallback, options?: ModalMissOptions): () => void
```

The callback `cb` receives a `ModalMissEvent`, whose `miss` field distinguishes two cases:

| Event | Meaning |
| --- | --- |
| `{ miss: false }` | The key was handled by the modal layer — not a missed key |
| `{ miss: true, key, input, eventNames }` | The key was not handled by the modal layer — a missed key; `key` / `input` / `eventNames` describe it |

The optional fields of `options`:

- `[monitorWhen]` {boolean} When `true`, a key hitting a binding whose `when` condition is `false` is also treated as a missed key; otherwise it's treated as handled. **Default:** `false`.
- `[monitorFocusMismatch]` {boolean} When `true`, a key hitting a binding on a non-active focus target is also treated as a missed key. **Default:** `false`.
- `[elementId]` {string} The element the listener belongs to. Auto-injected by `useKeyboard()` when called inside a modal element; usually no need to pass it.

`useModalMissListener` must be called **inside a modal layer** to take effect. Calling it inside an ordinary layer doesn't throw, but the listener never truly activates.

Here's a minimal runnable example: press `1` to open a help popup that shows the name of the most recently missed key at the bottom.

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

  useEffect(() => {
    // Press 1 to open the help popup
    return boundKeyboard('1', () => {
      openModalLayer('help', 100);
      applyElementToModalLayer('help', {
        element: HelpModal,
        elementId: 'help-body',
      });
    });
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>Press 1 to open the help popup</Text>
    </Box>
  );
}
registerComponent(Home, {});

function HelpModal() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard, useModalMissListener } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);
  const [lastMiss, setLastMiss] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const close = boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
    // Listen for missed keys: keys not handled by the modal layer fire the callback
    const unlisten = useModalMissListener((evt) => {
      if (evt.miss) {
        setLastMiss(evt.eventNames.join(' / '));
      }
    });
    return () => {
      close();
      unlisten();
    };
  }, [boundKeyboard, closeModalLayer, useModalMissListener, ctx]);

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
      flexDirection="column"
    >
      <Text>❓ Help (press return to close)</Text>
      <Text dimColor>
        {lastMiss ? `Unbound key: ${lastMiss}` : 'Press any unbound key to try'}
      </Text>
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
- Press `z` (not bound by the popup): the missed-key callback fires, and the popup shows "Unbound key: z" at the bottom;
- Press `return` (bound by the popup): the callback receives `miss: false`, and the bottom hint stays unchanged;
- While the popup is open, missed keys like `z` are still swallowed by the barrier and never reach the screen below — the listener only notifies you; it doesn't change the flow of the event.

## Summary

| Method | Purpose |
| --- | --- |
| `useModalMissListener(cb, options?)` | Listens inside a modal layer for keys that aren't handled |
| `ModalMissEvent` | `miss: false` means handled; `miss: true` means a missed key, with `key` / `input` / `eventNames` |

## Caveats

1. **Must be used inside a modal layer.** Calling it inside an ordinary layer has no effect; calling it outside a modal layer returns a no-op.
2. **Missed keys are still swallowed by the barrier.** The listener only tells you "a key wasn't handled"; it doesn't change the flow of the event.
3. **`monitorWhen` / `monitorFocusMismatch` default to `false`.** Set them to `true` only when you want keys that hit a `when`-false binding or a non-active focus target to count as missed too.
4. **`useModalMissListener` is a method from `useKeyboard()`; call it inside `useEffect` and return its unbind function.** The listener is cleaned up when the component unmounts.
