# 图层层级

图层打开时按顺序堆叠；`bringLayerToFront` 把某个图层提到最前，`restoreLayerZIndex` 把它还原到打开时的层级。常用于点击 / 悬停时唤起被遮挡的图层。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 两个函数都作用于普通图层 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 层级顺序决定键盘事件的层间传播顺序 |

## bringLayerToFront(targetLayerId)

把目标图层提到最前。

- `targetLayerId` {string} 目标图层 id。
- 返回：无。

把该图层的 `zIndex` 设为当前最大值 +1 后重排。已是顶层则不动作；元素的引用与用户状态被保留（不重挂载）。它不改变打开时的初始层级，因此可被 `restoreLayerZIndex` 还原。模态层不受影响——传入模态层 id 会被忽略并告警。

## restoreLayerZIndex(targetLayerId)

把目标图层还原到打开时的层级。

- `targetLayerId` {string} 目标图层 id。
- 返回：无。

把 `zIndex` 还原为打开时的初始值后重排；已在初始层级则不动作。

## 示例

`useMouseRegion` 的 `clickOnRise` / `enterOnRise` 等选项内部即调用 `bringLayerToFront` / `restoreLayerZIndex`。

```tsx
const { bringLayerToFront, restoreLayerZIndex } = useScreenSystem()

bringLayerToFront("edit-panel")    // 提到最前
restoreLayerZIndex("edit-panel")   // 还原
```

## 告警

| 情况 | 告警 |
|---|---|
| `bringLayerToFront` 目标不是已注册的普通图层 | `bringLayerToFront("<id>") ignored: no regular layer with this ID is registered. Modal layers are unaffected by bringLayerToFront.` |
| `restoreLayerZIndex` 目标不是已注册的普通图层 | `restoreLayerZIndex("<id>") ignored: no regular layer with this ID is registered.` |
