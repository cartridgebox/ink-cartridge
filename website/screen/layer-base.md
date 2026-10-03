# Learning the basics of layers: `openLayer` and related methods

In real apps there are plenty of tool panels, dashboards, toolbars, and dialogs floating over the screen. Ink V7 introduced absolute positioning and lets a `Box` leave the document flow, which gives ink-cartridge an entry point for building layers. On top of that, ink-cartridge ships a complete layer system.

A **layer** is a container that floats above the screen and is independent of the screen tree. It takes no part in navigation and always renders above the current screen. Multiple layers are stacked by `zIndex`: the higher the `zIndex`, the more visually on top it is, and the higher its keyboard and mouse priority.

The layer system has two categories:

- **Ordinary layers** — opened with `openLayer`, closed with `closeLayer`; suited for persistent overlays such as tool panels, dashboards, and toolbars;
- **Modal layers** — opened with `openModalLayer`, closed with `closeModalLayer`; rendered above ordinary layers, and only the modal layer with the highest `zIndex` receives keyboard events. Suited for dialogs and confirm boxes that need to own the keyboard.

After opening a layer you still need `applyElement` to mount an element into it and `eraseElement` to remove one; `activateElement` / `deactivateElement` control whether an element receives keyboard events; `closeAllLayer` closes all ordinary layers at once.

This chapter focuses on **ordinary layers**: it first explains the basic concept of a layer, then walks through the core methods `openLayer`, `applyElement`, `closeLayer`, and more.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Organize Your Screen](/screen/screen-registry) | Layers float above the screen, so know what a screen is first |
| [Navigation](/screen/navigation) | Whether a layer survives a page switch is tied to navigation |

## The concept of a layer

Before we start, one key fact: **`openLayer` only opens an empty container — it renders nothing by itself**. To actually show a layer you need two steps:

1. **Open the layer** — register it with the screen system via `openLayer`;
2. **Mount an element** — mount a component into the layer with `applyElement`.

A layer itself is an absolutely-positioned container that fills the terminal. `CurrentScreen` renders in the order **current screen → ordinary layers → modal layers**: each layer is first rendered as a full-screen container, and the elements inside it (the components you mounted with `applyElement`) position themselves anywhere on the screen using Ink V7's absolute positioning.

A layer is **independent of the screen tree**. It doesn't participate in `skip` / `back` / `gotoScreen` navigation; it always floats above the current screen. Multiple layers are stacked and prioritized by `zIndex`: the higher the `zIndex`, the more visually on top it is, and the higher its keyboard and mouse priority.

Here's a minimal runnable example: press `a` on the Home screen to open a tool-panel layer.

```tsx
import React, { useEffect } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
  useScreenSystem,
} from 'ink-cartridge';

function Home() {
  const { openLayer, applyElement } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    // Press a to open a layer and mount an element into it
    return boundKeyboard(['a'], () => {
      openLayer('tool-panel', 10);
      applyElement('tool-panel', {
        element: ToolPanel,
        elementId: 'tool-panel-body',
      });
    });
  }, [boundKeyboard, openLayer, applyElement]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>Press a to open the tool panel</Text>
    </Box>
  );
}
registerComponent(Home, {});

// An element inside a layer is also an ordinary React component that
// floats itself into position with absolute positioning
function ToolPanel() {
  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>🧰 Tool Panel</Text>
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

After pressing `a`, a yellow-bordered floating panel appears in the top-right corner, floating above the Home screen. Here:

- `openLayer('tool-panel', 10)` opens a layer named `tool-panel` with `zIndex` 10;
- `applyElement('tool-panel', { element: ToolPanel, elementId: 'tool-panel-body' })` mounts the `ToolPanel` component into the layer;
- `ToolPanel` never calls `registerComponent` — it's an ordinary component that positions itself in the top-right corner via absolute positioning.

You can read all currently opened ordinary layers through `useScreenSystem()`'s `allLayers`, which is handy for checking whether a layer already exists.

## Opening a layer with `openLayer`

The signature of `openLayer`:

```typescript
openLayer(layerId: string, zIndex: number, options?: LayerOptions): void
```

- `layerId` {string} The layer's unique ID; the same ID can only be opened once.
- `zIndex` {number} The layer's priority; a higher value puts it on top and gives it higher keyboard and mouse priority.
- `[options]` {LayerOptions} Optional config, see below.

The optional fields of `LayerOptions`:

- `[crossPage]` {boolean} When `true`, the layer is not auto-cleared on page switches (`skip` / `back` / `gotoScreen`). **Default:** `false`.
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} Controls the scope of the layer's keyboard bindings (covered in a later article). **Default:** `false`.

> **Note:** `openLayer` only opens an empty container. You still need `applyElement` to mount elements, otherwise nothing shows on screen.

## Mounting an element with `applyElement`

`applyElement` mounts an element into an **already opened** layer:

```typescript
applyElement<C extends ComponentType<any>>(targetLayerId: string, layerElement: LayerElementInput<C>): void
```

`layerElement` provides:

- `element` {ComponentType&lt;C&gt;} The component to mount into the layer.
- `elementId` {string} The element's unique ID within the layer.
- `[props]` {ComponentProps&lt;C&gt;} Props passed to the element, type-checked just like `skip()`'s `params`.
- `[active]` {boolean} When `false`, the element stops receiving keyboard events. **Default:** `true`.

`props` is strictly type-checked: the props you pass must match the prop type declared by the `element` component, otherwise it's a compile error. For example:

```tsx
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'tool-panel-body',
  props: { title: 'My Tools' }, // must match ToolPanel's props type
});
```

```tsx
function ToolPanel({ title }: { title: string }) {
  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>{title}</Text>
    </Box>
  );
}
```

## Reading layer info with `LayerElementContext`

A component mounted into a layer is wrapped in a `LayerElementContext` Provider. Inside the component you can read info about the layer it belongs to via `useContext(LayerElementContext)`, such as the layer's ID.

```tsx
import React, { useContext, useEffect } from 'react';
import { Box, Text } from 'ink';
import { LayerElementContext, useKeyboard, useScreenSystem } from 'ink-cartridge';

function ToolPanel() {
  const { closeLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const layerCtx = useContext(LayerElementContext);

  useEffect(() => {
    // Press Escape to close the layer this element lives in
    return boundKeyboard(['escape'], () => {
      if (layerCtx?.layer) {
        closeLayer(layerCtx.layer.layerId);
      }
    });
  }, [boundKeyboard, closeLayer, layerCtx]);

  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>🧰 Tool Panel (press Esc to close)</Text>
    </Box>
  );
}
```

`layerCtx.layer` is the layer object the current element belongs to, and `layerCtx.layer.layerId` is its ID. With it, an element doesn't need to know in advance which layer it's in — it can grab its own layer in a callback and act on it.

## Closing a layer with `closeLayer`

`closeLayer` closes a layer and clears all the elements on it:

```tsx
closeLayer('tool-panel');
```

Once closed, every element mounted on the layer disappears with it. Calling `closeLayer` on an ID that isn't registered is a no-op (a warning is shown in development).

## Removing elements with `eraseElement` and `closeAllLayer`

`eraseElement` removes only a single element from a layer; the layer itself stays open:

```tsx
// Remove the tool-panel-body element from the tool-panel layer; the layer stays open
eraseElement('tool-panel', 'tool-panel-body');
```

`closeAllLayer` closes all ordinary layers at once:

```tsx
closeAllLayer();
```

When several layers are open at the same time, `closeAllLayer` quickly clears them all.

## API reference

| Method | Signature | Description |
| --- | --- | --- |
| `openLayer` | `openLayer(layerId, zIndex, options?)` | Opens an ordinary layer |
| `applyElement` | `applyElement(targetLayerId, layerElement)` | Mounts an element into a layer |
| `closeLayer` | `closeLayer(targetLayerId)` | Closes a layer and all its elements |
| `eraseElement` | `eraseElement(targetLayerId, targetElementId)` | Removes a single element from a layer |
| `closeAllLayer` | `closeAllLayer()` | Closes all ordinary layers |
| `activateElement` | `activateElement(targetLayerId, targetElementId)` | Reactivates an element's keyboard events (see a later article) |
| `deactivateElement` | `deactivateElement(targetLayerId, targetElementId)` | Suspends an element's keyboard events (see a later article) |

## Caveats

1. **`layerId` must be unique.** Re-opening the same ID is a no-op (a warning is shown in development); close the layer first to reopen it. Ordinary layers and modal layers share the same ID namespace, and reusing a modal layer's ID throws an error.
2. **Call `openLayer` first, then `applyElement`.** Mounting an element into an unopened layer throws, and the error message tells you to register the layer with `openLayer` first.
3. **`elementId` must be unique within a layer.** Re-applying the same `elementId` is a no-op (a warning is shown in development).
4. **`openLayer` only opens an empty container.** Without any mounted element, a layer renders nothing.
5. **Ordinary layers are cleared on page switches by default.** Running `skip` / `back` / `gotoScreen` clears every layer whose `crossPage` is `false`; set it to `true` to keep the layer across pages (covered in a later article).
6. **Layer methods work both as hooks and as module-level imports.** The methods above come from `useScreenSystem()`, and can also be imported directly from `ink-cartridge`.
