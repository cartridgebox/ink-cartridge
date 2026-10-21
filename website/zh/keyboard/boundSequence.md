# 多键序列

`boundSequence` 要求按顺序在超时内按下多个键，类似 vim 的 `d d`。第一个键不会立即触发，引擎进入待续状态并等待后续键；任一步超时或按错键，序列作废。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 序列是绑定的一种形式 |
| [绑定归属与所有者栈](/zh/screen/binding-attribution) | 序列的归属与 `boundKeyboard` 相同 |

## 签名

```ts
boundSequence(keys: string[], handler: KeyHandler, options?: SequenceOptions): () => void
```

- `keys` {string[]} 依次按下的键，至少两个。
- `handler` {() => void} 完整匹配后执行。
- `options` {SequenceOptions} 在 `BoundKeyboardOptions` 上增加 `timeout` 与 `exclusive`。
- 返回：解绑函数。

```tsx
const { boundSequence } = useKeyboard()

useEffect(
  () => boundSequence(['d', 'd'], () => deleteItem()),
  [boundSequence],
)
```

`boundSequence(['a'], ...)` 会抛错：`requires at least 2 keys in the sequence`。

## 选项

| 选项 | 类型 | 作用 | 默认值 |
|---|---|---|---|
| `timeout` | `number` | 相邻按键的最大间隔（ms） | `500` |
| `exclusive` | `boolean` | 按错键时静默吞掉并继续等待；`false` 则取消序列并放行该键 | `false` |
| `when` | `() => boolean \| string` | 条件 | — |
| `mode` | `string` | 限定模式 | — |
| `focusId` | `string \| FocusRef` | 绑定到焦点目标 | — |
| `elementId` | `string` | 绑定到图层元素 | 自动注入 |
| `stopsWorkingAfterLayerAppearing` | `boolean` | 图层出现时休眠 | `false` |

```tsx
boundSequence(['g', 'g'], () => jumpToTop(), { timeout: 700 })
boundSequence(['w', 'w'], () => lock(), { exclusive: true })
```

`times`、`once`、`observer` 虽然出现在 `SequenceOptions` 类型中，但序列匹配不使用它们，只对 `boundKeyboard` 生效。

## 查询待续状态

```ts
currentScreenHasSequenceWaiting(sync?)
thereGlobalQueueWaiting(sync?)
```

- `currentScreenHasSequenceWaiting` 读取调用方自身作用域：页面组件读到页面的序列，图层或模态元素读到该图层的序列。
- `thereGlobalQueueWaiting` 对应 `globalSequence`。
- 两者都接受可选的 `sync` 回调，引擎在每次按键后调用它，便于状态栏重新渲染。

```tsx
const { currentScreenHasSequenceWaiting } = useKeyboard()
const [, setTick] = useState(0)
const sync = useCallback(() => setTick((n) => n + 1), [])

const waiting = currentScreenHasSequenceWaiting(sync)
```

它们只报告状态，不消费按键。

## 边界

- 每匹配一个键都会重置 `timeout`。
- `exclusive: false` 时，按错的键会取消序列并继续走自己的绑定；`true` 时被吞掉。
- 序列与映射键共享同一套归属和焦点规则。
- 组件卸载前返回解绑函数，避免残留待续序列。
