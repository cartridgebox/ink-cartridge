# 跨页图层与键盘接管

普通图层默认随页面切换一起关闭。需要让一个图层跨页面常驻时，用 `crossPage: true`；常驻图层又要避免在其他页面上抢键盘时，用 `automaticTakeoverKeyboard` 限定它的键盘生效范围。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 两个选项都属于 `LayerOptions` |
| [屏幕导航](/zh/screen/navigation) | `crossPage` 作用于 `skip` / `back` / `gotoScreen` |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 接管改变的是图层参与键盘分发的时机 |

## crossPage：跨页保留

```ts
openLayer('toolbar', 10, { crossPage: true })
```

- `crossPage` {boolean} 默认 `false`。
- 为 `false` 时，执行 `skip` / `back` / `gotoScreen` 会关闭该图层及其全部元素。
- 为 `true` 时，图层保留；元素组件不重新挂载，内部状态、`regionFocus` 映射都保持原样。
- 模态层使用同一选项，行为一致。

`crossPage` 只决定图层是否被页面切换清除，不改变它在键盘和鼠标中的优先级。

## automaticTakeoverKeyboard：限定键盘生效范围

```ts
openLayer('toolbar', 10, {
  crossPage: true,
  automaticTakeoverKeyboard: true,
})
```

- `false`（默认）：不接管。图层在每一页都参与键盘分发。
- `true`：只在**宿主页**参与键盘分发。宿主页是打开图层时处于栈顶的屏幕（记录在 `hostPage`）。切到其他页面后，绑定休眠；返回宿主页后恢复。
- `ComponentType[]`：在列出的页面上休眠，在其他页面正常参与。列表优先于宿主页——即使列表包含宿主页，该页上也休眠。
- 模态层使用同一选项：它的元素在休眠时停止响应，但模态层本身仍在，键盘屏障继续吞掉未被处理的键。

这个选项只影响键盘。图层的鼠标区域仍然参与命中测试，不随它休眠。

## 典型组合

常驻工具栏只在它所属的页面上响应快捷键：

```tsx
function Editor() {
  const { openLayer, applyElement } = useScreenSystem()

  useEffect(() => {
    openLayer('toolbar', 10, {
      crossPage: true,
      automaticTakeoverKeyboard: true,
    })
    applyElement('toolbar', { element: Toolbar, elementId: 'bar' })
  }, [openLayer, applyElement])
}
```

从 `Editor` 跳到其他页面后，工具栏仍然显示，但 `Toolbar` 里 `boundKeyboard` 注册的键不再响应；回到 `Editor` 后自动恢复。

只在个别页面上让出键盘，其余页面保持响应：

```tsx
openLayer('toolbar', 10, {
  crossPage: true,
  automaticTakeoverKeyboard: [Preview, Settings],
})
```

在 `Preview` 和 `Settings` 上休眠，在其他页面参与键盘分发。

## 边界

| 情况 | 行为 |
|---|---|
| 设置 `automaticTakeoverKeyboard` 但 `crossPage: false` | 页面切换时图层已被关闭，接管范围没有实际意义；两者通常一起使用 |
| 页面数组包含宿主页 | 宿主页也休眠，数组判断优先 |
| `hostPage` 为 `null` | 打开图层时路径为空，`true` 不会让图层休眠 |
| 图层关闭后重新打开 | `hostPage` 与接管范围按新的打开时机重新计算 |
| 元素被 `deactivateElement` 暂停 | 与接管无关；暂停是元素级，接管是图层级 |
| 模态层的元素全部休眠 | 屏障仍在；未处理的键依旧被吞掉，且这些未激活元素上的 `allowModal` 规则不会执行 |

接管只改变键盘分发，不改变图层的渲染、鼠标命中或 `zIndex`。
