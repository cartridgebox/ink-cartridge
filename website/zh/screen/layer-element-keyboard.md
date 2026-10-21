# 图层元素的键盘接收

每个图层元素都有独立的键盘接收状态 `active`。暂停一个元素只让它不再接收按键：元素仍然渲染，绑定仍然注册，内部状态不会丢失。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 元素的挂载与移除 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 暂停的元素不参与图层内广播 |

## 初始状态

`applyElement` 的 `active` 字段决定元素挂载后是否接收键盘事件：

```ts
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'panel-body',
  active: false,   // 挂载即暂停；元素仍渲染
})
```

默认值为 `true`。

## 运行时切换

```ts
deactivateElement(targetLayerId: string, targetElementId: string): void
activateElement(targetLayerId: string, targetElementId: string): void
```

```tsx
const { deactivateElement, activateElement } = useScreenSystem()

deactivateElement('tool-panel', 'panel-body')
activateElement('tool-panel', 'panel-body')
```

暂停后，该元素不再参与所在图层的广播；恢复后沿用原来的绑定与状态。

## 边界

- **暂停不等于卸载。** 元素的渲染、`boundKeyboard` 注册和内部状态都保留，`activateElement` 可以直接恢复。
- **暂停的元素不能自己恢复。** 它收不到任何按键，恢复必须由其他元素或屏幕触发。
- **`active` 只影响键盘。** 元素照常渲染，鼠标区域也照常命中。
- **`eraseElement` 是销毁。** 被移除的元素连同绑定一起消失，之后只能重新 `applyElement`。
- 模态层使用 `activateElementInModalLayer` / `deactivateElementInModalLayer`，见[模态层内元素的键盘响应](/zh/screen/modal-layer-element-keyboard)。
