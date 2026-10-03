# 组合引擎

组合引擎把多个按键组织成「链」：一个键产生一个值并设定一个 `flag`，下一个键承接该 `flag` 继续，直到链结束。适合 `3 d`（次数 + 动作）、`d w`（操作 + 目标）这类需要携带中间状态的复合输入。撤销历史（`undoComposition`）也建立在这套 `flag` 之上。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [多键序列](/zh/keyboard/boundSequence) | 链的推进与「待续」类似，但会携带状态 |
| [中级绑定](/zh/keyboard/boundKeyboard-advanced) | `when` 命名条件在组合条目上同样可用 |

## CompositionKey

一条 `CompositionKey` 描述「按下某个键时做什么」。

- `key` {string} 触发键名。
- `flags` {FlagTransition[]} 状态迁移表，元素为 `{ need, become }`：当前 flag 为 `need` 时，执行后变为 `become`。
- `needs` {string[]} 本键期望的前置 flag；承接哪些 flag 后才响应。
- `alternativeFlag` {string} 无前置 / 无匹配时的兜底 flag。
- `optional` {boolean} 为 `true` 时，无链待续也可作为链头启动。
- `execute` {Function} 处理函数 `(ctx) => ctx | null`；返回 `null` 表示链在此终止。
- `isEndKey` {string[]} 当前 flag 落在其中时，链视为结束。
- `timeout` {number} 相邻键超时（毫秒）。 **默认值：** 引擎 `defaultTimeout`（`400`）。
- `exclusive` {boolean} 打断键被静默吞掉还是取消链。
- `undoAction` {Function} 撤销时的反操作 `(ctx) => ctx | null`；返回 `null` 停止回退。
- `when` / `mode` / `category` / `affectOverlay` / `executeWhenNoOverlay` 与其它绑定一致。

链中的状态通过 `CompositionContext` 传递：`{ value, lastFlag, steps }`。

## registryCompositionKey(entry)

注册一条组合键。

- `entry` {CompositionKey} 组合键定义，见上。
- 返回：无。

```tsx
const { registryCompositionKey } = useKeyboard()

useEffect(() => {
  // 链头：数字键写入 value，并设为 flag "times"
  registryCompositionKey({
    key: "3", flags: [], needs: [], optional: true, alternativeFlag: "times",
    execute: (ctx) => ({ ...ctx, value: 3, lastFlag: "times", steps: [...ctx.steps, "3"] }),
  })
  // 承接：d 在 flag "times" 之后响应，读取次数并终止链
  registryCompositionKey({
    key: "d", flags: [], needs: ["times"], alternativeFlag: "action",
    execute: (ctx) => { deleteLines(ctx.value as number); return null },
  })
}, [])
```

## removeCompositionKey(key)

- `key` {string} 要移除的触发键名。
- 返回：{boolean} 存在并移除返回 `true`。
- 注意：不会中止正在待续的链。

## clearAllCompositionKeys()

清空所有组合条目。不中止正在待续的链。

- 返回：无。

## abortComposition()

立即取消正在待续的链。

- 返回：无。

## hasPendingComposition()

- 返回：{boolean} 当前是否有正在待续的链。

## getCompositionContext()

- 返回：{CompositionContext} 当前链上下文的浅拷贝。

## setValueSchema(schema)

设置链的值类型校验。

- `schema` {ValueSchema} `Record<flagName, (value) => boolean>`。引擎在 `execute` 之前校验输入值、之后校验输出值；某 flag 无守卫则放行。
- 返回：无。

校验失败会清空待续链，且仅在非 production 环境 `console.warn`。

## undoComposition(steps?, options?)

逐步反向执行已完成链的 `undoAction`。

- `steps` {number} 撤销的链数。 **默认值：** `1`。
- `options` {Object} 可选。
  - `isolated` {boolean} `true` 时每条从自身保存的 `ctx` 起算。 **默认值：** `false`。
  - `byKey` {boolean} 按**键数**而非链数计算 `steps`。 **默认值：** `false`。
- 返回：{CompositionContext | null} 撤销后的上下文；无可撤销时 `null`。

请求步数超过缓冲区时抛错（`Cannot undo N sequence(s): only M buffered.`）；某条的 `undoAction` 返回 `null` 时停止回退，其后条目仍留在缓冲区。

## bufferedCompositionCount()

- 返回：{number} 当前可撤销的链数。

## clearCompositionBuffers()

清空撤销历史。

- 返回：无。

## subscribeComposition(fn)

- `fn` {Function} 状态变化时调用。
- 返回：{Function} 取消订阅的函数。

## getLastCompositionEvent()

- 返回：{CompositionEvent | null} 最近一次事件。

事件类型：`started`、`continued`、`completed`、`aborted`、`broken`、`consumed`、`undone`、`cleared`。
