# 模态层内元素的键盘响应

模态层元素与普通图层元素一样有 `active` 状态。暂停元素只让它停止响应按键；模态层的键盘屏障不因此消失。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [模态层](/zh/screen/modal-layer-base) | 元素挂载方式 |
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 屏障与顶层独占 |

## 初始状态

```ts
applyElementToModalLayer('confirm', {
  element: ElementA,
  elementId: 'element-a',
  active: false,   // 挂载即暂停；元素仍渲染
})
```

默认值为 `true`。

## 运行时切换

```ts
deactivateElementInModalLayer(targetModalLayerId: string, targetElementId: string): void
activateElementInModalLayer(targetModalLayerId: string, targetElementId: string): void
```

```tsx
const { deactivateElementInModalLayer, activateElementInModalLayer } = useScreenSystem()

deactivateElementInModalLayer('confirm', 'element-a')
activateElementInModalLayer('confirm', 'element-a')
```

暂停与恢复通常由模态层内部的其他元素触发：屏幕被屏障挡住，页面上的绑定收不到键。

## 边界

- **暂停不等于卸载。** 元素继续渲染，绑定和内部状态保留。
- **屏障不因元素暂停而消失。** 即使所有元素都暂停，未处理的键仍被吞掉。
- **暂停的元素不能自己恢复。** 必须由模态层内其他元素调用恢复方法。
- **`active` 只影响键盘。** 鼠标区域仍参与命中测试。
- **`eraseElementInModalLayer` 是销毁。** 被移除的元素需要重新挂载。
