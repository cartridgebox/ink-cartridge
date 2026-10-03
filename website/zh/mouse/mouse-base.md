# 鼠标区域：`useMouseRegion()`

`useMouseRegion()` 把一个 Ink `<Box>` 登记成鼠标区域。引擎测量这个 Box 的实际矩形，对终端鼠标事件做命中测试，命中后触发你传入的回调。

```typescript
useMouseRegion(callbacks: MouseRegionCallbacks, options?: MouseRegionOptions): RefObject<DOMElement | null>
```

返回的 ref 挂到 `<Box>` 上即可，坐标由引擎测量，不需要手算。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 鼠标区域建立在 `KeyboardProvider` 之上，需要先了解 Provider 的嵌套关系 |
| [普通图层](/zh/screen/layer-base) | 命中测试按图层划分优先级，区域归属决定谁收到事件 |

## 开启鼠标支持

鼠标能力默认关闭，必须给 `KeyboardProvider` 加 `mouse`：

```tsx
<ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
  <KeyboardProvider mouse>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

打开后终端进入鼠标追踪模式，SGR 鼠标报文会被自动从键盘流里过滤掉，不会作为乱码流进 `useInput`。

> 需要 TTY 输入流。非 TTY 环境会打印 `[ink-cartridge] Mouse tracking requires a TTY input stream — mouse events disabled.` 并跳过鼠标能力，其余功能不受影响。

## 让一个 Box 成为点击区域

三步：拿 ref → 挂到 Box → 在回调里处理。

```tsx
function SubmitButton() {
  const [count, setCount] = useState(0);

  const boxRef = useMouseRegion({
    onClick: () => setCount((n) => n + 1),
  });

  return (
    <Box ref={boxRef} borderStyle="round" paddingX={3} paddingY={1}>
      <Text>点我（{count}）</Text>
    </Box>
  );
}
```

**能点到的面积就是这个 Box 实际渲染出来的矩形**，与里面文字的宽度无关。判定条件是半开区间：

```
x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
```

由此有一个容易踩空的情况：**没有尺寸也没有内容的 Box 测量结果是 0×0**，上式恒不成立，区域永远命中不了。所以：

- 要更大的热区，用 `paddingX` / `paddingY` 撑开 Box，而不是指望文字周围的空白
- 要固定热区，直接给 `width` / `height`
- `borderStyle` 占的边框也算在矩形内，光标落在边框上同样算命中

`useMouseRegion` 必须在组件里调用（它要 `useId` 和多个 context），不要放进循环或条件分支——一个组件对应一个区域。

## 回调与事件对象

- `onClick` {(event, rect) => void} 点击命中区域。
- `onWheel` {(event, rect) => void} 滚轮命中区域。
- `onEnter` {(event, rect) => void} 鼠标移入区域。
- `onLeave` {(event) => void} 鼠标移出区域。
- `onDragStart` {(event, rect) => void} 区域内按下后产生第一个 `drag`。
- `onDragMove` {(event, rect) => void} 拖拽过程中每次 `drag`。
- `onDragEnd` {(event, rect) => void} 拖拽结束的 `release`。

`onLeave` 只拿到 `event`，其余回调都会额外拿到被命中的矩形 `rect`。

事件对象的字段：

- `x` / `y` {number} 1-based 的终端列 / 行。
- `button` {string} `left` / `middle` / `right` / `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right` / `back` / `forward` / `none` / `unknown`。
- `action` {string} `move` / `press` / `release` / `drag` / `wheel` / `click`。
- `shift` / `alt` / `ctrl` {boolean} 事件发生时修饰键是否按下。
- `protocol` {string} `SGR`（现代协议，坐标无实际上限）或 `ESC`（旧协议，坐标上限 223）。
- `raw` / `data` {number | string} 终端原始按钮码 / 原始 ANSI 序列。

## 把坐标换算成区域内的格位

`event.x` / `event.y` 是终端绝对坐标，`rect.x` / `rect.y` 是区域左上角的终端坐标，两者都是 1-based。相减得到区域内的 0-based 偏移：

```tsx
onClick: (event, rect) => {
  const col = event.x - rect.x;
  const row = event.y - rect.y;
}
```

区域自带边框时，内容区还要再让掉边框宽度（1 格边框就减 1）：

```tsx
const col = event.x - rect.x - 1;
```

一个格子一个格子的场景（表格、画板）就是这样把点击落到具体格位上的。

> 区域矩形取自 Ink 的布局坐标 +1，前提是内容从终端左上角开始渲染——配合 `fullScreen` 使用成立。若应用不是全屏、输出发生滚动，终端坐标会和布局坐标错位，命中测试随之偏移。

## 悬停反馈

悬停不做任何事是不会有效果的，得自己用 `onEnter` / `onLeave` 驱动状态：

```tsx
const [hovered, setHovered] = useState(false);

const boxRef = useMouseRegion({
  onEnter: () => setHovered(true),
  onLeave: () => setHovered(false),
});

return (
  <Box ref={boxRef} borderStyle="round" borderColor={hovered ? 'cyan' : 'gray'}>
    <Text>Hover me</Text>
  </Box>
);
```

`onEnter` / `onLeave` 在跨边界时各触发一次，不会在区域内移动时反复触发。

## 点击与拖拽的分工

两者的判定完全不同：

- **点击**：`press` 之后 `release`，且两轴位移都不超过 `clickDistanceThreshold`（默认 1 格）→ 只触发 `onClick`
- **拖拽**：`press` 之后产生 `move` → 依次触发 `onDragStart`、每次 `onDragMove`、`release` 时 `onDragEnd`

几个直接推论：

- 手抖不超过 1 格仍然算点击，不会误判成拖拽
- 位移超过阈值就不再合成点击事件，所以拖拽走完**不会**补一个 `onClick`
- 拖拽目标在 `press` 那一刻就被捕获，光标拖出区域后 `onDragMove` 照常继续
- `onDragStart` 一次拖拽只触发一次
- 纯点击不会触发 `onDragEnd`

阈值在 Provider 上调整：

```tsx
<KeyboardProvider mouse mouseOptions={{ clickDistanceThreshold: 2 }}>
```

`onDragMove` 通常配合 `event.x` / `event.y` 做绝对定位，例如拖动窗口：

```tsx
onDragStart: (event) => setGrabOffset(event.x - rect.x),
onDragMove: (event) => setPosition({ x: event.x - grabOffset, y: event.y }),
```

## 滚轮

滚轮走 `onWheel`，方向从 `event.button` 读，不要用 `event.action`：

```tsx
onWheel: (event) => {
  if (event.button === 'wheel-up') scrollUp();
  if (event.button === 'wheel-down') scrollDown();
}
```

## 重叠区域与优先级

区域重叠时由 `priority` 决定归属，**越大越优先**，默认 `0`；`priority` 相同时**后注册的赢**。

为什么需要它：React 先挂载子组件再挂载父组件，所以子控件先注册，同优先级下在重叠处会输给后注册的容器。给控件一个高于容器的 `priority` 即可：

```tsx
// 容器面板（先注册的其实是子组件）
useMouseRegion({ onClick: () => selectPanel() }, { priority: 0 });

// 面板内的按钮
useMouseRegion({ onClick: () => doAction() }, { priority: 1 });
```

命中顺序与键盘一致：**最顶层的模态层 > 普通图层（后开的优先）> 根区域**。并且**模态层打开期间只有最顶层模态层参与命中测试，未命中即结束**，不会向下穿透到普通图层或根区域——想让模态下方的区域保持可点，就应该用普通图层而不是模态层。细节见[模态层基础](/zh/screen/modal-layer-base)。

## 区域标识 `regionId`

每个区域需要一个唯一标识，默认按调用位置自动生成，通常不用管。显式传入是为了稳定识别同一个区域，例如在拖拽、悬停记账时把它当作 key：

```tsx
useMouseRegion({ onDragMove: (e) => move(e.x, e.y) }, { regionId: 'window-titlebar' });
```

`regionId` **不是**图层元素的 id。同一图层内复用同一个 id，后注册的区域会覆盖先注册的那个。
