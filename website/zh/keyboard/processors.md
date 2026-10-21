# 自定义处理器

每个按键事件都经过一条按 `weight` 排序的流水线。处理器返回 `true` 表示消费事件并终止流水线，返回 `false` 表示继续传递。内置处理器实现模态层、组合、全局键、图层和屏幕栈；自定义处理器可以观察或改写事件流。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 内置处理器实现的正是各类绑定 |
| [全局键绑定](/zh/keyboard/global-keys) | `affectLayer` 决定全局键所在的阶段 |

## 默认九阶段

| 阶段 id | weight | 作用 |
|---|---:|---|
| `modal` | 8000 | 模态层屏障 |
| `composition-overlay` | 7000 | 覆盖相组合 |
| `global-sequence-overlay` | 6000 | 覆盖相全局序列 |
| `global-key-overlay` | 5000 | 覆盖相全局键 |
| `layer` | 4000 | 图层广播 |
| `composition-screen` | 3000 | 屏幕相组合 |
| `global-sequence-screen` | 2000 | 屏幕相全局序列 |
| `global-key-screen` | 1000 | 屏幕相全局键 |
| `screen-stack` | 0 | 屏幕栈 |

- 降序执行；同 weight 的处理器属于同一阶段。
- 阶段内先让所有成员观察事件；任一成员返回 `true`，整个阶段即被消费，后续阶段不再运行。
- 内置阶段 weight 两两不同，各自独占一阶段。

## ProcessorInput

```ts
type ProcessorInput = {
  id: string
  process(ctx: PipelineContext): boolean
  active?: boolean   // 默认 true
}
```

`PipelineContext` 是事件到达时的状态快照：

| 字段 | 内容 |
|---|---|
| `input` / `key` | 终端原始输入与 Ink 的按键描述 |
| `eventNames` | 归一化后的键名 |
| `topComponent` / `pagePath` | 栈顶屏幕与完整页面路径 |
| `allLayers` / `allModalLayers` | 当前图层快照 |
| `globalKeys` / `globalSequences` | 已解析的全局条目 |
| `currentMode` / `conditions` | 当前模式与命名条件 |
| `compositionEngine` | 共享的组合引擎 |
| `wildcardFirst` | 通配符是否优先 |
| `autoTab` / `autoTabKey` | Tab 轮转配置 |
| `layersRef` / `layerKeyboardRefs` / `pendingSeqRef` | 可变状态引用 |
| `notifyFocusChange` / `notifyPendingSyncs` | 通知回调 |
| `compositionEngineHandler` | 当前是否由组合引擎处理 |

## 插入与排序

```ts
addProcessor(processor, options?)
```

| 选项 | 作用 |
|---|---|
| `weight` | 显式权重；等于现有阶段时并入，否则新开阶段 |
| `index` | 第 n 个阶段槽位，范围 `[0, 阶段数]` |
| `before` / `after` | 插到某处理器所在阶段之前或之后，自成阶段 |

省略选项时权重为 `0`，并入 `screen-stack` 阶段，并在其中排在 `screen-stack` 之后。它只会看到 `screen-stack` 未消费的事件。要在所有内置阶段之后独立运行，传负权重：

```ts
addProcessor(myAudit, { weight: -1 })
```

```tsx
const { addProcessor } = useKeyboard()

useEffect(
  () => addProcessor({
    id: 'logger',
    process(ctx) {
      console.log(ctx.eventNames)
      return false
    },
  }),
  [addProcessor],
)
```

`KeyboardProvider` 的 `processors` prop 也可以在构造时注入，支持 `{ processor, index }`、`{ processor, target, position }`、`{ processor }` 三种定位方式。

## 管理

| 方法 | 作用 |
|---|---|
| `removeProcessor(id)` | 移除，返回是否存在 |
| `getProcessors()` | 按执行顺序返回只读快照，含未激活项 |
| `activeProcessor(id)` | 激活；已激活或未知返回 `false` |
| `kickProcessor(id)` | 停用；流水线数组不变 |
| `setProcessorWeight(id, weight)` | 改权重并重排阶段 |
| `resetProcessors()` | 恢复默认九阶段，丢弃全部自定义处理器 |

## 错误

| 情况 | 错误 |
|---|---|
| id 重复 | `Cannot add processor "<id>": duplicate id` |
| index 越界 | `Cannot insert processor "<id>" at index <n>: expected an integer in [0, <stageCount>]` |
| `before` / `after` 目标不存在 | `Cannot insert <before\|after> "<id>": processor not found` |

## 边界

- 处理器共享同一个 `PipelineContext`；修改可变引用会影响后续阶段。
- 返回 `true` 会阻止后续阶段，包括屏幕栈；调试时先返回 `false`。
- `resetProcessors()` 会移除运行时注册的所有自定义处理器，通常只在测试或热重载中调用。
- 模块级 API 提供同名函数，见[模块级键盘 API](/zh/keyboard/module-api)。
