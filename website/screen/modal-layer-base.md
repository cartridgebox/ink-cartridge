# Learning the basics of modal layers: `openModalLayer` and related methods

In the previous chapter, we learned how to control keyboard reception of elements inside ordinary layers. In this chapter, we'll learn about **modal layers**: overlays that render above ordinary layers and suit dialogs and confirm boxes.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Layer Basics](/screen/layer-base) | A modal layer contrasts with and extends a regular layer |
| [Layer Element Keyboard](/screen/layer-element-keyboard) | The previous chapter |

## The concept of a modal layer

Real apps have many scenarios that need to **own the keyboard**: confirm boxes, modal dialogs, settings popups. While one of them is open, the user must make a choice or dismiss it — the rest of the UI shouldn't respond to keys. An ordinary layer can't satisfy this: it only floats above the screen, it doesn't intercept keys.

A **modal layer** is designed for exactly these scenarios. It renders **above ordinary layers**, and only the modal layer with the highest `zIndex` receives keyboard events: while a modal layer is open, it "takes over" the keyboard — keys not handled by the modal layer don't fall through to the ordinary layers or the screen below.

Modal layers are used almost exactly like ordinary layers, with a method for each counterpart:

| Ordinary layer | Modal layer |
| --- | --- |
| `openLayer` | `openModalLayer` |
| `applyElement` | `applyElementToModalLayer` |
| `closeLayer` | `closeModalLayer` |
| `eraseElement` | `eraseElementInModalLayer` |
| `closeAllLayer` | `closeAllModalLayer` |

`CurrentScreen` renders in the order **current screen → ordinary layers → modal layers**, so modal layers always appear on top.

Here's a minimal runnable example: press `a` on the Home screen to pop up a confirm dialog, and press `return` to confirm and close it.

```tsx
import React, { useContext, useEffect } from 'react';
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
    // Press a to open a modal layer and mount an element into it
    return boundKeyboard(['a'], () => {
      openModalLayer('confirm-dialog', 100);
      applyElementToModalLayer('confirm-dialog', {
        element: ConfirmDialog,
        elementId: 'confirm-body',
      });
    });
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>Press a to open the confirm dialog</Text>
    </Box>
  );
}
registerComponent(Home, {});

// Elements inside a modal layer read their own modal layer via ModalLayerElementContext
function ConfirmDialog() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);

  useEffect(() => {
    if (!ctx) return;
    // Press return to close the modal layer this element lives in
    return boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
  }, [boundKeyboard, closeModalLayer, ctx]);

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
      <Text>⚠️ Confirm delete? (press return to confirm)</Text>
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

After pressing `a`, a magenta rounded-bordered confirm dialog appears in the center of the terminal. Here:

- `openModalLayer('confirm-dialog', 100)` opens a modal layer named `confirm-dialog` with `zIndex` 100;
- `applyElementToModalLayer('confirm-dialog', { element: ConfirmDialog, elementId: 'confirm-body' })` mounts the `ConfirmDialog` component into the modal layer;
- `ConfirmDialog` reads `ctx.modalLayer.layerId` via `useContext(ModalLayerElementContext)` and closes the modal layer it lives in when `return` is pressed.

One behavior worth noticing: while the modal layer is open, the `a` key on the Home screen **stops responding** — the modal layer has taken over the keyboard. That's the fundamental difference from ordinary layers; we'll expand on the exact rules of keyboard takeover in the next chapter.

## Opening a modal layer with `openModalLayer`

`openModalLayer` has the same signature as `openLayer`:

```typescript
openModalLayer(layerId: string, zIndex: number, options?: ModalLayerOptions): void
```

- `layerId` {string} The modal layer's unique ID; shares the ID namespace with ordinary layers.
- `zIndex` {number} The modal layer's priority; a higher value puts it on top and gives it higher keyboard priority.
- `[options]` {ModalLayerOptions} Optional config, see below.

`ModalLayerOptions` is the same as `LayerOptions`:

- `[crossPage]` {boolean} When `true`, the modal layer is not auto-cleared on page switches (`skip` / `back` / `gotoScreen`). **Default:** `false`.
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} Controls the scope of the modal layer's keyboard takeover (covered in a later article). **Default:** `false`.

> **Note:** `openModalLayer` only opens an empty container. You still need `applyElementToModalLayer` to mount elements, otherwise nothing shows on screen.

## Mounting an element with `applyElementToModalLayer`

`applyElementToModalLayer` mounts an element into an **already opened** modal layer, used just like `applyElement`:

```typescript
applyElementToModalLayer<C extends ComponentType<any>>(
  targetModalLayerId: string,
  modalLayerElement: LayerElementInput<C>,
): void
```

`modalLayerElement` provides:

- `element` {ComponentType&lt;C&gt;} The component to mount into the modal layer.
- `elementId` {string} The element's unique ID within the modal layer.
- `[props]` {ComponentProps&lt;C&gt;} Props passed to the element, type-checked.
- `[active]` {boolean} When `false`, the element stops receiving keyboard events (see a later article). **Default:** `true`.

## Reading modal layer info with `ModalLayerElementContext`

A component mounted into a modal layer is wrapped in a `ModalLayerElementContext` Provider. Inside the component you can read info about the modal layer it belongs to via `useContext(ModalLayerElementContext)`, such as the modal layer's ID. That's the key to "closing itself" in the example above: `ctx.modalLayer.layerId` is the ID of the modal layer the current element lives in.

## Closing modal layers with `closeModalLayer` / `closeAllModalLayer`

`closeModalLayer` closes a modal layer and clears all the elements on it:

```tsx
closeModalLayer('confirm-dialog');
```

`closeAllModalLayer` closes all modal layers at once:

```tsx
closeAllModalLayer();
```

Calling `closeModalLayer` on an ID that isn't registered is a no-op (a warning is shown in development).

## Summary

| Method | Signature | Description |
| --- | --- | --- |
| `openModalLayer` | `openModalLayer(layerId, zIndex, options?)` | Opens a modal layer |
| `applyElementToModalLayer` | `applyElementToModalLayer(targetModalLayerId, layerElement)` | Mounts an element into a modal layer |
| `closeModalLayer` | `closeModalLayer(targetModalLayerId)` | Closes a modal layer and all its elements |
| `eraseElementInModalLayer` | `eraseElementInModalLayer(targetModalLayerId, targetElementId)` | Removes a single element from a modal layer |
| `closeAllModalLayer` | `closeAllModalLayer()` | Closes all modal layers |

## Caveats

1. **`layerId` shares the namespace with ordinary layers.** Ordinary layers and modal layers use the same set of IDs; reusing a modal layer's ID for an ordinary layer (or vice versa) throws an error.
2. **Call `openModalLayer` first, then `applyElementToModalLayer`.** Mounting an element into an unopened modal layer throws.
3. **`openModalLayer` only opens an empty container.** Without any mounted element, a modal layer renders nothing.
4. **Modal layers take over the keyboard.** While a modal layer is open, keys it doesn't handle don't fall through to the ordinary layers or the screen below; only the modal layer with the highest `zIndex` receives keyboard events (covered in a later article).
5. **Modal layers are cleared on page switches by default.** Running `skip` / `back` / `gotoScreen` clears every modal layer whose `crossPage` is `false`; set it to `true` to keep the layer across pages (covered in a later article).
6. **Modal layer methods work both as hooks and as module-level imports.** The methods above come from `useScreenSystem()`, and can also be imported directly from `ink-cartridge`.
