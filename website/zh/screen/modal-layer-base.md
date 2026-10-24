# 模态层

模态层渲染在普通图层之上，并接管键盘：只要还有模态层打开，未被它处理的按键不会落到普通图层或屏幕。它适合确认框、对话框等必须独占输入的场景。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 两套 API 一一对应 |
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 接管与屏障的具体规则 |

## 与普通图层的对应关系

| 普通图层 | 模态层 |
|---|---|
| `openLayer` | `openModalLayer` |
| `applyElement` | `applyElementToModalLayer` |
| `closeLayer` | `closeModalLayer` |
| `eraseElement` | `eraseElementInModalLayer` |
| `closeAllLayer` | `closeAllModalLayer` |
| `activateElement` | `activateElementInModalLayer` |
| `deactivateElement` | `deactivateElementInModalLayer` |

两套方法共用 ID 命名空间。`CurrentScreen` 的渲染顺序是：当前屏幕 → 普通图层 → 模态层。

## 打开与挂载

```ts
openModalLayer(layerId: string, zIndex: number, options?: ModalLayerOptions): void
applyElementToModalLayer(targetModalLayerId: string, element: LayerElementInput<C>): void
```

`ModalLayerOptions` 与 `LayerOptions` 相同：

- `[crossPage]` {boolean} 页面切换时保留。**默认值：** `false`。
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} 限定键盘接管的页面。**默认值：** `false`。见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover)。

```ts
const { openModalLayer, applyElementToModalLayer } = useScreenSystem()

openModalLayer('confirm', 100)
applyElementToModalLayer('confirm', {
  element: ConfirmDialog,
  elementId: 'body',
})
```

`openModalLayer` 同样只注册空容器，必须再挂载元素。

## 读取模态层信息

```tsx
const ctx = useContext(ModalLayerElementContext)
ctx?.modalLayer.layerId
```

用户传入的 `element` 组件可以直接用 `ModalLayerElementContext` 拿到自己所属的模态层，不需要把 ID 作为 prop 传进去。

## 关闭与移除

| 方法 | 作用 |
|---|---|
| `closeModalLayer(targetModalLayerId)` | 关闭模态层及其全部元素 |
| `eraseElementInModalLayer(modalLayerId, elementId)` | 只移除一个元素 |
| `closeAllModalLayer()` | 关闭所有模态层 |

关闭未注册的 ID 是无操作，开发环境会告警。

## 边界

- `layerId` 与普通图层共用命名空间；跨类型复用只会产生开发警告并被忽略，不会抛错。
- 必须先 `openModalLayer`，再挂载元素。向未打开的模态层挂载元素会被忽略：开发环境告警，生产环境静默。
- 只有 `zIndex` 最高的模态层接收键盘和鼠标事件。
- 未处理的按键被屏障吞掉；需要例外时用 [`allowModal`](/zh/screen/allow-modal)。
- 模态层默认在页面切换时关闭；`crossPage: true` 可以保留。
- 方法既可以从 `useScreenSystem()` 获取，也可以直接从 `ink-cartridge` 导入。
