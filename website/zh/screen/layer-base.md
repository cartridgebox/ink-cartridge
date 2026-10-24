# 普通图层

图层是悬浮在当前屏幕之上的容器，不参与屏幕树导航。它由两部分组成：一个由 `openLayer` 打开的空容器，以及用 `applyElement` 挂载进去的元素。多个图层按 `zIndex` 堆叠，`zIndex` 同时决定视觉、键盘和鼠标优先级。

普通图层适合工具面板、工具栏、看板等常驻浮层。需要独占键盘的对话框使用[模态层](/zh/screen/modal-layer-base)。

## 普通图层还是模态层？

| 需求 | 普通图层 | 模态层 |
|---|---|---|
| 工具面板、工具栏、看板 | 是 | — |
| 必须阻止按键落到下面的页面 | — | 是 |
| 同一时刻只允许一个浮层接管键盘 | — | 是 |
| 叠在所有普通图层之上 | — | 是 |
| 跨页面保留 | `crossPage: true` | `crossPage: true` |
| 暂停单个元素而不关闭整层 | `deactivateElement` | `deactivateElementInModalLayer` |

除非浮层必须独占输入，否则先用普通图层。模态屏障比更高的 `zIndex` 强得多。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [组织屏幕](/zh/screen/screen-registry) | 图层悬浮在屏幕之上 |
| [屏幕导航](/zh/screen/navigation) | 页面切换会清除未标记 `crossPage` 的图层 |

## 打开图层

```ts
openLayer(layerId: string, zIndex: number, options?: LayerOptions): void
```

- `layerId` {string} 唯一 ID；普通图层与模态层共用命名空间。
- `zIndex` {number} 堆叠与交互优先级，越大越靠前。
- `[options]` {LayerOptions}
  - `[crossPage]` {boolean} 页面切换时保留图层。**默认值：** `false`。见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover)。
  - `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} 限定图层的键盘生效页面。**默认值：** `false`。见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover)。

`openLayer` 只注册空容器，不会渲染内容。

```ts
const { openLayer } = useScreenSystem()

openLayer('tool-panel', 10)
```

## 挂载元素

```ts
applyElement(targetLayerId: string, layerElement: LayerElementInput<C>): void
```

- `element` {ComponentType} 要挂载的组件。
- `elementId` {string} 元素在图层内的唯一 ID。
- `[props]` {ComponentProps} 传给组件的 props，类型与 `element` 对齐。
- `[active]` {boolean} 是否参与键盘分发。**默认值：** `true`。

```tsx
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'panel-body',
  props: { title: 'Tools' },
})
```

元素通常用 Ink 的绝对定位把自己放到目标位置：

```tsx
function ToolPanel({ title }: { title: string }) {
  return (
    <Box position="absolute" top={2} left={30} width={30} height={8} borderStyle="round">
      <Text>{title}</Text>
    </Box>
  )
}
```

## 读取图层信息

挂载的元素被包裹在 `LayerElementContext` 中：

```tsx
const ctx = useContext(LayerElementContext)
ctx?.layer.layerId   // 当前元素所属图层
```

`ModalLayerElementContext` 是模态层的对应类型。

## 关闭与移除

| 方法 | 作用 |
|---|---|
| `closeLayer(targetLayerId)` | 关闭图层及其全部元素 |
| `eraseElement(targetLayerId, targetElementId)` | 只移除一个元素，图层保留 |
| `closeAllLayer()` | 关闭所有普通图层 |
| `activateElement(layerId, elementId)` | 恢复元素的键盘接收 |
| `deactivateElement(layerId, elementId)` | 暂停元素的键盘接收，元素仍渲染 |

```ts
closeLayer('tool-panel')
eraseElement('tool-panel', 'panel-body')
closeAllLayer()
```

关闭未注册的 ID 是无操作，开发环境会告警。

## 读取当前图层

`useScreenSystem()` 提供 `allLayers`（普通图层）和 `allModalLayers`（模态层），两者都按 `zIndex` 升序排列：

```ts
const { allLayers } = useScreenSystem()
const isOpen = allLayers.some((layer) => layer.layerId === 'tool-panel')
```

同一个 hook 还提供 `bringLayerToFront`、`restoreLayerZIndex` 和全部模态层方法，以及 `currentPath` / `pageLayer`。

## 边界

- `layerId` 必须唯一；重复打开同一 ID 是无操作并告警，复用模态层 ID 同样只会产生开发警告并被忽略，不会抛错。
- 必须先 `openLayer`，再 `applyElement`。向未打开的图层挂载元素会被忽略：开发环境告警，生产环境静默，图层也不会被顺带创建。
- `elementId` 在同一图层内必须唯一；重复挂载是无操作并告警。
- `CurrentScreen` 的渲染顺序是：当前屏幕 → 普通图层 → 模态层。
- 所有图层方法既可以从 `useScreenSystem()` 获取，也可以直接从 `ink-cartridge` 导入。
- 普通图层默认在 `skip` / `back` / `gotoScreen` 时关闭；`crossPage: true` 可以保留。
