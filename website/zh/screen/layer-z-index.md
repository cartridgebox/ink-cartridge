# 图层提升与层级

图层按 `zIndex` 从低到高堆叠。`zIndex` 同时决定视觉顺序、键盘优先级和鼠标命中顺序：值越大，越靠前，也越先收到事件。`bringLayerToFront` 把一个普通图层临时提到最前，`restoreLayerZIndex` 把它放回打开时的位置。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 提升只作用于普通图层 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 层级顺序决定键在图层之间的传播顺序 |

## 堆叠规则

- `allLayers` / `allModalLayers` 按 `zIndex` 升序排列，渲染与命中都从数组末尾开始。
- `zIndex` 相同时按 `createdAt` 排序：先打开的图层在下，后打开的在上。
- 模态层始终渲染在普通图层之上；普通图层无论怎么提升都越不过模态层。
- 提升会改变图层的 `zIndex`，但不会改变打开时的初始值，所以可以还原。

## bringLayerToFront(targetLayerId)

把目标普通图层的 `zIndex` 设为当前最大值 + 1，然后重新排序。

```ts
const { bringLayerToFront } = useScreenSystem()

bringLayerToFront('edit-panel')
```

- `targetLayerId` {string} 已打开的普通图层 ID。
- 返回：`void`。
- 图层已经位于最前时不动作。
- 图层对象通过展开重建，但 `elements`、`regionFocus`、`hostPage`、`crossPage` 引用保持不变，因此元素组件不会重新挂载，内部状态不会丢失。
- 传入模态层 ID 或未注册的 ID 会被忽略，并在开发环境打印警告。

## restoreLayerZIndex(targetLayerId)

把目标普通图层的 `zIndex` 还原为打开时的值，然后重新排序。

```ts
const { restoreLayerZIndex } = useScreenSystem()

restoreLayerZIndex('edit-panel')
```

- `targetLayerId` {string} 已打开的普通图层 ID。
- 返回：`void`。
- 已经在初始层级时不动作。
- 同样不会重新挂载元素；模态层与未注册 ID 被忽略并告警。

## 用鼠标手势提升图层

`useMouseRegion` 提供五个与提升相关的选项：

| 选项 | 触发时机 | 默认值 |
|---|---|---|
| `clickOnRise` | 点击区域时提升所在图层 | `false` |
| `dragOnRise` | 开始拖拽时提升 | `false` |
| `wheelOnRise` | 滚轮事件落在区域上时提升 | `false` |
| `enterOnRise` | 鼠标进入区域时提升 | `false` |
| `leaveOffRise` | 鼠标离开时还原 `zIndex`，仅在 `enterOnRise` 开启时生效 | `true` |

提升发生在用户自己的回调之前，所以 `onClick` / `onEnter` 里读到的已经是新的层级。

```tsx
const ref = useMouseRegion(
  { onClick: () => selectPanel() },
  { clickOnRise: true },
)

// 悬停提升，离开还原
const hoverRef = useMouseRegion(
  { onEnter: () => setHovered(true), onLeave: () => setHovered(false) },
  { enterOnRise: true, leaveOffRise: true },
)
```

模态层内的区域不会提升普通图层：模态层打开时鼠标只会命中它自己，普通图层本来也不会越过模态层。

## 常见用法

- **点击置顶**：多个面板重叠时，点击哪个就把哪个提到最前。
- **悬停预览**：鼠标进入时临时提升，离开后还原，避免面板被永久改序。
- **拖拽排序**：在 `onDragStart` 前提升被拖拽的面板。

## 边界

| 情况 | 行为 |
|---|---|
| `bringLayerToFront` 目标是模态层或未注册 ID | 忽略并告警：`bringLayerToFront("<id>") ignored: no regular layer with this ID is registered. Modal layers are unaffected by bringLayerToFront.` |
| `restoreLayerZIndex` 目标是模态层或未注册 ID | 忽略并告警：`restoreLayerZIndex("<id>") ignored: no regular layer with this ID is registered.` |
| 图层被关闭后重新打开 | 以新的 `zIndex` 和 `initialZIndex` 重新开始，之前的提升记录不保留 |
| 页面切换清除了普通图层 | 与提升无关；是否保留由 `crossPage` 决定，见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover) |

提升只改变层级，不改变键盘绑定或元素状态；图层的键盘顺序与视觉顺序始终一致。
