# 自定义处理器

每个按键事件都流经一条**九阶段管线**。每个阶段由一个或多个处理器（processor）组成，处理器决定事件是否在本阶段被消费。内置处理器实现了屏幕栈、图层、全局键、组合等机制；你可以在管线中插入自己的处理器，用来观测或改写事件流。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 内置处理器实现的正是绑定、全局键等机制 |
| [全局键绑定](/zh/keyboard/global-keys) | `affectLayer` 决定全局键落在哪个阶段 |

## 默认九阶段

`weight` 越大越先执行，内置值见 `builtinProcessorWeights`。

| 阶段 id | weight | 作用 |
|---|---|---|
| `modal` | 8000 | 模态层屏障 |
| `composition-overlay` | 7000 | 覆盖相组合 |
| `global-sequence-overlay` | 6000 | 覆盖相全局序列 |
| `global-key-overlay` | 5000 | 覆盖相全局键 |
| `layer` | 4000 | 图层广播 |
| `composition-screen` | 3000 | 屏幕相组合 |
| `global-sequence-screen` | 2000 | 屏幕相全局序列 |
| `global-key-screen` | 1000 | 屏幕相全局键 |
| `screen-stack` | 0 | 屏幕栈 |

`processKey` 按 weight 降序遍历。**同一 weight 的处理器组成一个阶段**：阶段内每个处理器都先看一遍事件，只要有一个返回 `true`，整个阶段即被消费，后续阶段不再运行。内置阶段 weight 两两不同，因此各自独占一阶段。

## ProcessorInput

驱动一个处理器所需的最小形状。

- `id` {string} 处理器名，在管线内唯一。
- `process` {Function} `(ctx) => boolean`；返回 `true` 表示消费事件、终止管线。
- `active` {boolean} 是否启用。 **默认值：** `true`。

## addProcessor(processor, options?)

向管线插入一个处理器。

- `processor` {ProcessorInput} 处理器定义，见上。
- `options` {Object} 可选，决定插入位置。
  - `weight` {number} 显式权重；等于某内置阶段时并入该阶段，否则新开阶段。
  - `index` {number} 第 n 个阶段槽位（0 起，范围 `[0, 阶段数]`）。
  - `before` {string} 插到某处理器所在阶段之前，自成阶段。
  - `after` {string} 插到某处理器所在阶段之后，自成阶段。
- 返回：无。

省略 `options` 时权重为 `0`，处理器会**并入 `screen-stack` 阶段**（该阶段权重同为 `0`），在该阶段内按插入顺序排在 `screen-stack` 之后——并非排在所有内置之后的独立阶段。阶段作为整体被消费，因此它只会看到 `screen-stack` 未消费的事件。若要排在所有内置之后的独立阶段，请传负权重（如 `{ weight: -1 }`）。

```tsx
const { addProcessor } = useKeyboard()

useEffect(() => addProcessor({
  id: "logger",
  process(ctx) { console.log(ctx.input); return false },  // false = 不消费，继续传递
}), [addProcessor])

addProcessor(myAudit, { after: "layer" })
addProcessor(myGate, { before: "modal" })
```

## removeProcessor(processorId)

- `processorId` {string} 处理器名。
- 返回：{boolean} 存在并移除返回 `true`。

## getProcessors()

- 返回：{PipelineProcessor[]} 按处理顺序的只读快照，**含未激活者**。

## activeProcessor(id)

激活一个处理器。

- `id` {string} 处理器名。
- 返回：{boolean} 本次激活成功返回 `true`；已激活或未知返回 `false`。

## kickProcessor(id)

停用一个处理器。`processKey` 会跳过它，但管线数组不变。

- `id` {string} 处理器名。
- 返回：{boolean} 本次停用成功返回 `true`；已停用或未知返回 `false`。

## setProcessorWeight(id, weight)

修改处理器权重，重排到相应阶段。

- `id` {string} 处理器名。
- `weight` {number} 新权重。
- 返回：{boolean} 存在并修改返回 `true`。

## resetProcessors()

恢复默认九阶段，**丢弃所有自定义处理器**及其状态。

- 返回：无。

## 错误

| 情况 | 错误 |
|---|---|
| id 重复 | `Cannot add processor "<id>": duplicate id` |
| index 越界 | `Cannot insert processor "<id>" at index <n>: expected an integer in [0, <阶段数>]` |
| `before` / `after` 目标不存在 | `Cannot insert <before\|after> "<id>": processor not found` |
