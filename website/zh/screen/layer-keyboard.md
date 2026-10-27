# 图层间的键盘事件

图层阶段位于键盘流水线中部：模态层之后、全局键与屏幕栈之间。事件在图层之间**自上而下**传播，在一个图层内部**广播**；某层命中后不再向下，未命中则继续冒泡。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 图层元素用 `boundKeyboard` 注册绑定 |
| [基本绑定](/zh/keyboard/base-bind) | 绑定的注册与清理方式 |

## 绑定归属

图层元素里的 `boundKeyboard` 自动归属到该元素：

```tsx
function ToolPanel() {
  const { boundKeyboard } = useKeyboard()

  useEffect(() => boundKeyboard('w', () => count()), [boundKeyboard])
}
```

绑定只在图层打开、元素 `active` 时参与分发。`useKeyboard()` 会从 `LayerElementContext` 注入 `layerId` / `elementId`，通常不需要手动传。

## 传播规则

1. **自上而下**：从 `zIndex` 最高的图层开始，逐层向下尝试。
2. **图层内广播**：同一图层内所有激活元素都会收到事件，可以同时响应。
3. **命中即停**：某层的任一元素处理了事件，事件即被消费，不再流向更低的图层或屏幕栈。
4. **未命中冒泡**：整层都没有处理时，事件继续向下一个图层传递。
5. **兜底屏幕栈**：所有图层都未处理时，事件进入屏幕栈，从当前屏幕向根屏幕尝试。

```ts
openLayer('layer-b', 10)
openLayer('layer-a', 20)   // 先收到键盘事件
```

两个图层都绑定 `return` 时，只有 `layer-a` 会响应；它不处理的键才轮到 `layer-b`。

同一图层内挂两个元素、都绑定 `return` 时，两个元素都会收到：

```tsx
openLayer('panel', 10)
applyElement('panel', { element: ElementA, elementId: 'a' })
applyElement('panel', { element: ElementB, elementId: 'b' })
```

## 层级细节

- `zIndex` 相同时按 `createdAt`：先打开的图层在下，后打开的在上。
- 提升图层会同时改变视觉、键盘和鼠标顺序，见[图层提升与层级](/zh/screen/layer-z-index)。
- 模态层始终高于普通图层；只要模态层打开，普通图层就收不到键盘事件。见[模态层键盘事件](/zh/screen/modal-layer-keyboard)。
- 元素被 `deactivateElement` 暂停后不参与广播；图层关闭后绑定全部失效。
- 同一图层内分两轮：`auto-tab`、通配符与多键序列先对所有激活元素求值，普通绑定随后广播。序列一旦接管按键，兄弟元素的普通绑定不会再收到它——与元素的 `applyElement` 顺序无关。
