# 原始鼠标 API

`useMouseRegion` 面向组件；需要直接消费解析后的鼠标事件时，使用 `@cartridge-engine/keyboard-engine` 导出的 `Mouse` 类。`KeyboardProvider` 内部驱动的也是它。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [鼠标区域](/zh/mouse/mouse-base) | 组件级 API 与命中测试 |
| [在非 React 环境使用引擎](/zh/keyboard/non-react) | 非 React 宿主的事件循环 |

## 构造

```ts
import { Mouse } from '@cartridge-engine/keyboard-engine'

const mouse = new Mouse(options?)
```

| 选项 | 作用 | 默认值 |
|---|---|---|
| `inputStream` | 读取鼠标报文的流 | `process.stdin` |
| `outputStream` | 写入终端控制序列的流 | `process.stdout` |
| `emitter` | 事件发射器 | 新建 `EventEmitter` |
| `setRawMode` | 自定义 raw mode 切换 | `inputStream.setRawMode` |
| `clickDistanceThreshold` | 点击允许的最大位移（格） | `1` |
| `pressStormThreshold` | 连续多少次无释放按下后进入降级点击模式 | `3` |
| `pressStormWindowMs` | 计数窗口（ms） | `500` |
| `degradedDedupDistance` | 降级模式下同一点击的去重距离（格） | `1` |
| `degradedDedupWindowMs` | 降级模式下去重时间窗（ms） | `300` |

降级模式用于不报告释放事件的终端（例如 VS Code 内置终端）：当连续按下达到阈值后，按下本身会被合成为点击。

## 能力检查

```ts
Mouse.isSupported(inputStream?, outputStream?)   // boolean
Mouse.checkSupport(options?)                       // 'supported' | 'not_tty' | 'output_not_tty'
```

`Mouse.SupportCheckResult` 导出这三个字符串常量。

```ts
if (!Mouse.isSupported()) {
  // 跳过鼠标功能，键盘仍可用
}
```

## 生命周期

```ts
mouse.enable()      // 写入开启序列，进入 raw mode
mouse.disable()     // 恢复终端状态
mouse.pause()       // 暂停解析，保持已开启
mouse.resume()
mouse.isEnabled()
mouse.isPaused()
mouse.destroy()     // 恢复终端并释放资源
```

`enable` 失败会回滚已经生效的部分并抛出 `MouseError`。结束时显式调用 `destroy()`，不要依赖 GC。

## 事件

```ts
mouse.on('click', (event) => …)
mouse.once('wheel', (event) => …)
mouse.off('click', handler)
mouse.on('error', (error) => …)
```

事件名：`move`、`press`、`release`、`drag`、`wheel`、`click`，以及 `error`。

`wheel` 的按钮固定为 `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right`；`move` 的按钮为 `none`；`click` 是合成的动作，`drag` 携带真实按钮。

```ts
mouse.on('click', (event) => {
  console.log(`${event.x},${event.y} ${event.button}`)
})
```

`mouse.getLastPosition()` 返回最近一次位置 `{ x, y }`，没有时为 `null`。

## 防抖移动流

```ts
for await (const event of mouse.debouncedMoveEvents({ interval: 100, signal })) {
  redraw(event.x, event.y)
}
```

每个间隔只交出最新一次移动；循环忙时到达的移动不会丢失，下一次拉取仍会返回它。`signal` 用于中止，结束后调用 `destroy()`。

## 接入引擎

把原始事件交给键盘引擎做区域命中：

```ts
const mouse = new Mouse()
mouse.enable()

mouse.on('click', (event) => engine.processMouseEvent(event))
engine.getHoveredMouseRegion()   // { layerId, regionId } | null
```

React 宿主通常不需要这一层：`<KeyboardProvider mouse>` 已经完成接线。

## 边界

- 需要 TTY 输入与输出；否则 `enable()` 抛错。
- 同一进程不要同时创建多个 `Mouse`，它们会争抢 raw mode 与终端序列。
- `pause()` 只停止解析，不恢复终端；离开界面时用 `disable()` 或 `destroy()`。
- 事件坐标是 1-based 终端坐标，与 `useMouseRegion` 的 `rect` 一致。
