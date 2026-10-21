# 鼠标区域

`useMouseRegion` 把一个 Ink `<Box>` 登记为鼠标区域。引擎测量它实际渲染出的矩形，对终端鼠标事件做命中测试，然后调用对应回调。

```ts
useMouseRegion(callbacks: MouseRegionCallbacks, options?: MouseRegionOptions): RefObject<DOMElement | null>
```

把返回的 ref 挂到 `<Box>` 上即可，坐标由引擎测量。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 鼠标区域依附于 `KeyboardProvider` |
| [普通图层](/zh/screen/layer-base) | 命中顺序按图层划分 |

## 开启鼠标

```tsx
<KeyboardProvider mouse>
  <CurrentScreen />
</KeyboardProvider>
```

开启后终端进入鼠标追踪模式，SGR 鼠标报文会从键盘流中过滤掉，不会进入 `useInput`。需要 TTY；否则打印 `[ink-cartridge] Mouse tracking requires a TTY input stream — mouse events disabled.` 并跳过鼠标能力。

## 回调

| 回调 | 签名 | 时机 |
|---|---|---|
| `onClick` | `(event, rect)` | 点击 |
| `onWheel` | `(event, rect)` | 滚轮 |
| `onEnter` | `(event, rect)` | 进入区域 |
| `onLeave` | `(event)` | 离开区域 |
| `onDragStart` | `(event, rect)` | 按下后第一个拖拽事件 |
| `onDragMove` | `(event, rect)` | 拖拽过程中的每个事件 |
| `onDragEnd` | `(event, rect)` | 结束拖拽的释放 |

```tsx
const ref = useMouseRegion({
  onClick: (event, rect) => {
    const col = event.x - rect.x
    const row = event.y - rect.y
    setCell(col, row)
  },
})
```

事件对象：

| 字段 | 内容 |
|---|---|
| `x` / `y` | 终端列 / 行，1-based |
| `button` | `left` / `middle` / `right` / `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right` / `back` / `forward` / `none` / `unknown` |
| `action` | `move` / `press` / `release` / `drag` / `wheel` / `click` |
| `shift` / `alt` / `ctrl` | 修饰键状态 |
| `protocol` | `SGR` 或 `ESC` |
| `raw` / `data` | 原始按钮码 / ANSI 序列 |

## 区域矩形

命中区域就是 Box 实际渲染的矩形，判定为半开区间：

```
x >= rect.x && x < rect.x + rect.width
y >= rect.y && y < rect.y + rect.height
```

- 没有尺寸和内容的 Box 测得 0×0，永远命中不了；用 `paddingX` / `paddingY` 或显式 `width` / `height` 撑开。
- 边框计入矩形。
- 非全屏、输出滚动的应用会有坐标偏移；配合 `fullScreen` 使用最可靠。

## 点击与拖拽

- **点击**：`press` 后 `release`，两轴位移都不超过 `clickDistanceThreshold`（默认 1 格），只触发 `onClick`。
- **拖拽**：`press` 后出现 `move`，依次触发 `onDragStart`、`onDragMove`、`onDragEnd`；拖拽目标在按下时捕获，光标离开区域后仍继续。
- 拖拽完成后不会再补 `onClick`；纯点击不会触发 `onDragEnd`。

```tsx
<KeyboardProvider mouse mouseOptions={{ clickDistanceThreshold: 2 }}>
```

`mouseOptions` 中的函数值按引用身份忽略，数值或流变化才会重建 Mouse。

## 滚轮

方向从 `event.button` 读取：

```tsx
onWheel: (event) => {
  if (event.button === 'wheel-up') scrollUp()
  if (event.button === 'wheel-down') scrollDown()
}
```

## 重叠与优先级

- `priority` 越大越先命中，默认 `0`；同优先级时后注册者胜。
- 子组件通常先于父组件注册，给子控件更高 `priority` 才能在重叠处胜出。
- 命中顺序：最顶模态层 > 普通图层（后开的先试）> 根区域。
- 模态层打开时只命中它的顶层，未命中即结束，不会穿透到下方。见[模态层键盘事件](/zh/screen/modal-layer-keyboard)。

```tsx
useMouseRegion({ onClick: selectPanel }, { priority: 0 })  // 容器
useMouseRegion({ onClick: doAction },    { priority: 1 })  // 内部按钮
```

## 区域标识与提升

```ts
useMouseRegion(callbacks, {
  regionId: 'window-titlebar',
  clickOnRise: true,
  enterOnRise: true,
  leaveOffRise: true,
})
```

- `regionId` 在同一图层内唯一；它不等于图层元素 ID，重复会覆盖先注册者。
- `clickOnRise` / `dragOnRise` / `wheelOnRise` / `enterOnRise` 在对应手势发生时提升所在普通图层，`leaveOffRise` 在离开时还原。见[图层提升与层级](/zh/screen/layer-z-index)。

## 边界

- 必须在组件顶层调用，不能放进循环或条件分支；一个组件对应一个区域。
- 鼠标能力关闭或输入不是 TTY 时，区域不会收到事件。
- 区域的鼠标命中不受 `active` 或 `automaticTakeoverKeyboard` 影响；后者只影响键盘。
- 需要直接消费解析后的原始事件流时，使用 [`Mouse`](/zh/mouse/mouse-raw)。
