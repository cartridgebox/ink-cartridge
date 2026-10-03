# 映射键

映射键（mapping）把用户实际按的一串键重定向到另一串内部键——相当于 vim 的 `:map`。它先于普通绑定与组合键接管按键。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [多键序列](/zh/keyboard/boundSequence) | 映射的 `base` 与序列一样有多键与超时 |
| [组合引擎](/zh/keyboard/composition) | 映射的 `target` 是一串组合键 |

## addMapping(base, target, options?)

注册一条映射。

- `base` {string[]} 外部序列，即用户实际按下的键。
- `target` {string[]} 目标序列，需已在引擎注册为组合键或绑定。
- `options` {Object} 可选。
  - `timeout` {number} 相邻键的最大间隔（毫秒）。 **默认值：** 引擎 `defaultTimeout`（`400`）。
  - `exclusive` {boolean} 打断键被静默吞掉（`true`）还是取消映射（`false`）。 **默认值：** `false`。
  - `when` {Function | string} 条件，每次按键都重新求值；为假时映射中断。
  - `mode` {string} 限定生效模式。
  - `category` {unknown[] | string} 栈顶屏幕白名单；`"*"` 表示全部。
  - `affectOverlay` {boolean} 触发相；`true` 在层广播之前，否则之后。 **默认值：** `false`。
- 返回：{boolean} 注册成功返回 `true`；`base` 为空、目标键未注册、或同一 `base` 已存在时返回 `false`（**不抛错**）。

```tsx
const { addMapping } = useKeyboard()

useEffect(() => {
  addMapping(["g", "b"], ["t", "d"])   // 按 g b，等于按 t d
  addMapping(["q"], ["t"])             // 单键映射
}, [addMapping])
```

## removeMappingKey(keys)

移除一条映射（按序列精确匹配）。

- `keys` {string[]} 要移除的 `base` 序列。
- 返回：{boolean} 存在并移除返回 `true`。

## removeMapping(firstKey)

移除所有以某键开头的映射。

- `firstKey` {string} 序列首键。
- 返回：{boolean} 存在并移除返回 `true`。

## subscribeMapping(fn)

订阅映射状态变化。

- `fn` {Function} 状态变化时调用。
- 返回：{Function} 取消订阅的函数。

## getLastMappingEvent()

- 返回：{MappingKeyEvent | null} 最近一次映射事件；无则 `null`。

事件类型：`started`、`continued`、`completed`、`broken`、`consumed`、`cancelled`。

```tsx
const { subscribeMapping, getLastMappingEvent } = useKeyboard()

useEffect(() => subscribeMapping(() => {
  if (getLastMappingEvent()?.type === "completed") flash()
}), [subscribeMapping, getLastMappingEvent])
```

## 行为边界

- 单键映射与多键映射共享首键时，**单键优先**，且按注册顺序取先注册者。
- 映射待续与组合待续互斥，映射键优先。
- 在某一相（`affectOverlay`）启动的映射，不会被另一相的处理器推进。
- 移除 / 清空映射键**不会**中止正在待续的映射——需要时请自行 `abortComposition()`。
