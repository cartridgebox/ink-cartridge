# 在非 React 环境使用引擎

`KeyboardEngine` 是框架无关的核心；`KeyboardProvider` 只是 React 适配层。Vue、Svelte 或纯 Node 宿主可以直接持有引擎实例，自行完成「同步屏幕状态 → 处理按键 → 清理过期层」的循环。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 引擎提供同名绑定方法 |
| [绑定归属与所有者栈](/zh/screen/binding-attribution) | 非 React 宿主需要手动维护所有者栈 |
| [键名规范](/zh/keyboard/key-names) | 构造引擎需要两个键名函数 |

## 构造

```ts
new KeyboardEngine(props: EngineProps)
```

| 字段 | 类型 | 作用 | 默认值 |
|---|---|---|---|
| `normalizeKeyNames` | `(input, key) => string[]` | **必填**，归一化键名 | — |
| `isNormalChar` | `(key) => boolean` | **必填**，判断普通字符 | — |
| `modes` | `string[]` | 初始模式 | `[]` |
| `defaultMode` | `string` | 初始模式名 | 无模式 |
| `processors` | `KeyboardProcessorProps[]` | 构造期注入处理器 | — |
| `defaultTimeout` | `number` | 组合链超时（ms） | `400` |
| `valueSchema` | `ValueSchema` | 组合值校验 | — |
| `autoTab` | `boolean` | 接管 Tab / Shift+Tab | `false` |
| `tabKey` | `string` | 正向 Tab 键名；反向匹配 `shift+<tabKey>` | `"tab"` |
| `releaseFocusWhenEmpty` | `boolean` | 最后一个绑定解绑时移除焦点目标 | `false` |

```ts
import { KeyboardEngine, normalizeKeyNames, isInkSpecialKey } from 'ink-cartridge'

const engine = new KeyboardEngine({
  normalizeKeyNames,
  isNormalChar: (key) => !isInkSpecialKey(key),
  modes: ['normal', 'insert'],
  defaultMode: 'normal',
})
```

## 驱动循环

```ts
engine.sync(state)          // 推送页面与图层状态
engine.processKey(input, key) // 处理一次按键
```

`sync` 的参数：

```ts
{
  pagePath: Component[]     // 从根到当前屏幕
  layers: Layer[]           // 普通图层，按 zIndex 升序
  modalLayers: Layer[]      // 模态层，按 zIndex 升序
}
```

每次页面或图层状态变化后、处理按键前调用 `sync`。`processKey` 返回 `true` 表示事件被消费。

```ts
engine.sync({ pagePath: [Menu], layers: [], modalLayers: [] })
const un = engine.boundKeyboard(['ctrl+s'], () => save())

// 在宿主的按键回调中
engine.processKey(input, key)
```

## 所有者与元素

在图层元素内注册绑定时，宿主需要手动压栈并传 `elementId`：

```ts
engine.pushOwner('tool-panel')
engine.boundKeyboard('w', () => step(), { elementId: 'panel-body' })
engine.popOwner('tool-panel')
```

- `pushOwner` / `popOwner` 按值移除最近的同名项。
- `boundKeyboard`、`boundSequence`、`stop`、`penetration`、`allowModal` 都依赖所有者。
- `allowModal` 只对模态层元素生效。

## 清理过期键盘层

`sync` 之后，引擎里可能还留着已经从页面路径或图层快照中移除的键盘数据。三个方法按来源清理：

```ts
engine.cleanLayers()          // 清理已离开 pagePath 的页面键盘数据
engine.cleanOverlayLayers()   // 清理已关闭的普通图层元素键盘
engine.cleanModalLayers()     // 清理已关闭的模态层元素键盘
```

React 适配层在状态同步时完成这一步；非 React 宿主在页面或图层变化后调用对应方法。

## 鼠标

原始鼠标事件交给引擎做区域命中：

```ts
engine.processMouseEvent(event)
engine.getHoveredMouseRegion()
```

`Mouse` 类负责把终端输入解析为事件，见[原始鼠标 API](/zh/mouse/mouse-raw)。

## 注入 React

`KeyboardProvider` 的 `engine` prop 接受预建实例；此时 `modes` / `defaultMode` / `processors` / `valueSchema` / `autoTab` / `releaseFocusWhenEmpty` 被忽略，`mouse` 仍独立生效：

```tsx
const engine = useMemo(
  () => new KeyboardEngine({ normalizeKeyNames, isNormalChar }),
  [],
)

<KeyboardProvider engine={engine}>…</KeyboardProvider>
```

## 边界

- `sync` 必须发生在 `processKey` 之前；屏幕状态过期会导致归属与焦点错位。
- 没有所有者时，带归属的绑定方法会抛错。
- 引擎不管理终端 raw mode；由宿主或 `Mouse` 负责。
- 模块级 API 始终操作「最近挂载」的引擎；非 React 宿主应直接持有实例。
