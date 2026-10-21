# Regular layers

A layer floats above the current screen and takes no part in screen-tree navigation. It has two parts: an empty container opened with `openLayer`, and elements mounted into it with `applyElement`. Multiple layers stack by `zIndex`, which decides visual, keyboard, and mouse priority.

Regular layers suit tool panels, toolbars, and dashboards. Dialogs that must own the keyboard use [modal layers](/screen/modal-layer-base).

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Organizing Screens](/screen/screen-registry) | Layers float above the current screen |
| [Navigation](/screen/navigation) | Page switches clear layers without `crossPage` |

## Opening a layer

```ts
openLayer(layerId: string, zIndex: number, options?: LayerOptions): void
```

- `layerId` {string} Unique ID; regular and modal layers share the namespace.
- `zIndex` {number} Stacking and interaction priority; higher is in front.
- `[options]` {LayerOptions}
  - `[crossPage]` {boolean} Keep the layer across page switches. **Default:** `false`. See [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover).
  - `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} Limit the pages on which the layer participates in key dispatch. **Default:** `false`. See [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover).

`openLayer` registers an empty container; it renders nothing by itself.

```ts
const { openLayer } = useScreenSystem()

openLayer('tool-panel', 10)
```

## Mounting an element

```ts
applyElement(targetLayerId: string, layerElement: LayerElementInput<C>): void
```

- `element` {ComponentType} The component to mount.
- `elementId` {string} Unique element ID within the layer.
- `[props]` {ComponentProps} Props passed to the component; type-checked against `element`.
- `[active]` {boolean} Whether the element takes part in key dispatch. **Default:** `true`.

```tsx
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'panel-body',
  props: { title: 'Tools' },
})
```

Elements usually position themselves with Ink's absolute layout:

```tsx
function ToolPanel({ title }: { title: string }) {
  return (
    <Box position="absolute" top={2} left={30} width={30} height={8} borderStyle="round">
      <Text>{title}</Text>
    </Box>
  )
}
```

## Reading layer information

Mounted elements are wrapped in `LayerElementContext`:

```tsx
const ctx = useContext(LayerElementContext)
ctx?.layer.layerId   // the layer this element belongs to
```

`ModalLayerElementContext` is the modal counterpart.

## Closing and removing

| Method | Effect |
|---|---|
| `closeLayer(targetLayerId)` | Closes the layer and all its elements |
| `eraseElement(targetLayerId, targetElementId)` | Removes one element; the layer stays open |
| `closeAllLayer()` | Closes every regular layer |
| `activateElement(layerId, elementId)` | Resumes the element's keyboard reception |
| `deactivateElement(layerId, elementId)` | Pauses it; the element keeps rendering |

```ts
closeLayer('tool-panel')
eraseElement('tool-panel', 'panel-body')
closeAllLayer()
```

Closing an unregistered ID is a no-op with a development warning.

## Reading the current layers

`useScreenSystem()` exposes `allLayers` and `allModalLayers`, both sorted by ascending `zIndex`:

```ts
const { allLayers } = useScreenSystem()
const isOpen = allLayers.some((layer) => layer.layerId === 'tool-panel')
```

The same hook also provides `bringLayerToFront`, `restoreLayerZIndex`, all modal-layer methods, and `currentPath` / `pageLayer`.

## Boundaries

- `layerId` must be unique. Reopening an open ID is a no-op with a warning; reusing a modal ID throws.
- Call `openLayer` before `applyElement`; mounting into an unopened layer throws.
- `elementId` must be unique within a layer; re-applying one is a no-op with a warning.
- `CurrentScreen` renders in the order: current screen → regular layers → modal layers.
- Every layer method is available both from `useScreenSystem()` and as a direct import from `ink-cartridge`.
- Regular layers close on `skip` / `back` / `gotoScreen` by default; `crossPage: true` keeps them.
