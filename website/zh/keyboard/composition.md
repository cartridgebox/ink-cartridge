# 组合引擎

组合引擎把多个按键串成一条**链**。每个键读取并改写一个 `CompositionContext`，用 `lastFlag` 把状态交给下一环；链可以携带任意中间值，也可以登记撤销操作。`3 d`（次数 + 动作）、`d w`（操作 + 目标）这类输入都适合用组合表达。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [多键序列](/zh/keyboard/boundSequence) | 序列只匹配按键，组合额外携带状态 |
| [中级绑定](/zh/keyboard/boundKeyboard-advanced) | `when` 与命名条件同样适用于组合条目 |

## 模型

```ts
type CompositionContext<T = unknown> = {
  value: T
  lastFlag: string | null
  steps: string[]
}
```

- `value` 在链中传递的任意值。
- `lastFlag` 上一环留下的 flag；链头为 `null`。
- `steps` 已执行的键名，供撤销与调试。

一条 `CompositionKey`：

| 字段 | 类型 | 作用 |
|---|---|---|
| `key` | `string` | 触发键名 |
| `flags` | `{ need, become }[]` | 状态迁移表：上一 flag 为 `need` 时，本键执行后变为 `become` |
| `needs` | `string[]` | 接受哪些前置 flag；不在列表中的键不会承接 |
| `alternativeFlag` | `string` | 链头，或没有匹配的迁移时使用的 flag |
| `optional` | `boolean` | 没有待续链时也可以作为链头 |
| `timeout` | `number` | 下一键的超时，默认引擎 `defaultTimeout`（400ms） |
| `exclusive` | `boolean` | 按错键时吞掉并继续等待，而不是取消链 |
| `execute` | `(ctx) => ctx \| null` | 改写上下文；返回 `null` 终止链 |
| `undoAction` | `(ctx) => ctx \| null` | 撤销时的反操作；返回 `null` 停止回退 |
| `isEndKey` | `string[]` | 当前 `lastFlag` 命中时结束链 |
| `SwallowKeyWhenChainInterrupted` | `boolean` | `execute` 返回 `null` 或校验失败时，吞掉打断键 |
| `when` / `mode` / `category` / `affectOverlay` / `executeWhenNoOverlay` | — | 与其它绑定一致 |

`affectOverlay` 是组合与映射条目的阶段字段；`globalKeys` / `globalSequence` 使用的是 `affectLayer`，两者不是同一个选项。

### flag 如何确定

- 链头（`lastFlag === null`）：使用 `alternativeFlag`。
- 承接键：若 `lastFlag` 命中 `flags` 中某条 `need`，使用对应的 `become`；否则使用 `alternativeFlag`。
- `execute` 返回的上下文若显式设置了 `lastFlag`，引擎不会覆盖它。

### 键如何被选中

同一触发键可以注册多条条目，引擎按以下顺序选择：

1. `needs` 与当前 `lastFlag` 匹配的条目优先；链头时接受 `optional: true` 或 `needs: []`。
2. 修饰键更多的键名优先（`ctrl+s` 高于 `s`）。
3. `needs` 更长的条目优先（约束更严格）。

## 注册

```ts
registryCompositionKey(entry: CompositionKey): void
```

```tsx
const { registryCompositionKey } = useKeyboard()

useEffect(() => {
  registryCompositionKey({
    key: '3',
    flags: [],
    needs: [],
    optional: true,
    alternativeFlag: 'times',
    execute: (ctx) => ({ ...ctx, value: 3, lastFlag: 'times', steps: [...ctx.steps, '3'] }),
  })

  registryCompositionKey({
    key: 'd',
    flags: [],
    needs: ['times'],
    alternativeFlag: 'action',
    execute: (ctx) => {
      if (typeof ctx.value !== 'number') return null
      deleteLines(ctx.value)
      return null
    },
  })
}, [registryCompositionKey])
```

`removeCompositionKey(key)` 删除该触发键的全部条目，返回是否删除；不会中止正在待续的链。`clearAllCompositionKeys()` 清空整张表。

`updateCompositionKey(key, flags, updates)` 按 `key + flags` 精确定位并合并字段，返回是否找到。同一 `key` 可以注册多条，用 `flags` 区分：

```ts
updateCompositionKey('d', [{ need: 'times', become: 'action' }], { timeout: 800 })
```

### 完整链：计数、执行、撤销

```ts
registryCompositionKey({
  key: '3',
  flags: [],
  needs: [],
  optional: true,
  alternativeFlag: 'count',
  execute: (ctx) => ({
    ...ctx,
    value: 3,
    steps: [...ctx.steps, '3'],
  }),
})

registryCompositionKey({
  key: 'd',
  flags: [{ need: 'count', become: 'deleted' }],
  needs: ['count'],
  alternativeFlag: 'deleted',
  execute: (ctx) => {
    if (typeof ctx.value !== 'number') return null
    return {
      ...ctx,
      value: deleteLines(ctx.value),
      steps: [...ctx.steps, 'd'],
    }
  },
  undoAction: (ctx) => ({
    ...ctx,
    value: restoreLines(ctx.value),
    steps: [],
  }),
})
```

按下 `3` 后链进入待续，`lastFlag` 变为 `count`；在超时内按下 `d`，`flags` 把 `lastFlag` 推进到 `deleted`。超时到期时链被记录，`undoComposition()` 反向执行 `d` 的 `undoAction`，再对 `3` 执行默认的空操作。若 `d` 之前按下了不匹配的键，链被丢弃，不会进入撤销缓冲；需要保留时给条目加 `exclusive: true`。

## 链的结束

| 结果 | 触发条件 | 进入撤销缓冲 | 事件 |
|---|---|---|---|
| 记录 | 超时到期、`isEndKey` 命中、`execute` 返回 `null`、`abortComposition()` | 是 | `completed`；显式中止为 `aborted` |
| 丢弃 | 按键没有匹配条目，或值守卫拒绝该键 | 否 | `broken` |

- `exclusive: true` 时，没有匹配的键被吞掉，链继续等待；超时最终到期时按「记录」结束。
- `isEndKey` 命中时 `execute` 仍会执行（副作用保留），但它返回的上下文被丢弃，该键本身不进入撤销缓冲，只有它之前的键被记录。
- `execute` 返回 `null` 表示主动终止，终止键本身同样不进入缓冲。默认打断键会继续流向更低阶段；设置 `SwallowKeyWhenChainInterrupted: true` 则吞掉它。
- 值守卫失败（输入或输出）会清空待续链，非 production 环境打印警告。

## 值校验

```ts
setValueSchema(schema: ValueSchema)
```

`ValueSchema` 是 `Record<flagName, (value) => boolean>`。引擎在 `execute` 之前按当前 `lastFlag` 校验输入值，之后按新 flag 校验输出值；没有守卫的 flag 放行。

```ts
setValueSchema({
  times: (v): v is number => typeof v === 'number',
  action: (v) => typeof v === 'number',
})
```

## 撤销

```ts
undoComposition(steps = 1, options?: { isolated?: boolean; byKey?: boolean })
```

- 默认 `steps` 按**链**计数；`byKey: true` 时按键数计数。
- `isolated: false`（默认）时，上下文跨链连续传递；`true` 时每条链从自己保存的 `ctx` 起算。
- 返回撤销后的上下文；没有可撤销内容时返回 `null`。
- 请求数量超过缓冲区时抛错：`Cannot undo N sequence(s): only M buffered.`（`byKey` 时为 `key(s)`）。
- 某条 `undoAction` 返回 `null` 时停止回退，该条及其之后的条目仍留在缓冲区。

```ts
const { undoComposition, bufferedCompositionCount, clearCompositionBuffers } = useKeyboard()

undoComposition()                  // 撤销最近一条链
undoComposition(2, { byKey: true }) // 撤销最近两个键
bufferedCompositionCount()          // 可撤销的链数
clearCompositionBuffers()           // 清空历史
```

## 事件

```ts
subscribeComposition(fn: () => void): () => void
getLastCompositionEvent(): CompositionEvent | null
```

| 事件 | 时机 |
|---|---|
| `started` | 链头执行成功 |
| `continued` | 承接键执行成功 |
| `completed` | 链完成并记录 |
| `aborted` | `abortComposition()` 显式中止 |
| `broken` | 按键没有匹配条目，链被丢弃 |
| `consumed` | `exclusive` 链吞掉不匹配的键 |
| `undone` | `undoComposition()` 执行完成，`steps` 为实际撤销数 |
| `cleared` | `clearCompositionBuffers()` |

`getCompositionContext()` 返回当前链上下文的浅拷贝；`hasPendingComposition()` 判断是否有待续链。

## 与映射键的关系

映射键先于组合键处理。`addMapping(base, target)` 把外部序列 `base` 映射为一串已注册的组合键 `target`，目标链走与直接输入相同的校验、结束与撤销逻辑。映射与组合的待续状态互斥，映射优先；详见[映射键](/zh/keyboard/mapping-keys)。

## 边界

- 组合条目与绑定共用 `when` / `mode` / `category` / `affectOverlay`；`affectOverlay: true` 的链在图层广播之前处理。
- 没有待续链、也没有 `optional` 的键不会成为链头。
- 屏幕切换不会自动清空撤销缓冲；需要时手动调用 `clearCompositionBuffers()`。
- `abortComposition()` 同时取消待续的映射序列。
- 一个键可以注册多条条目，`removeCompositionKey` 会删除该键的全部条目。
