# 快捷键与动作

动作系统把「按下什么键」和「执行什么回调」分开：先注册带唯一 `actionId` 的回调，再用动作 id 绑定按键。改键位不需要碰回调，改回调也不需要重新绑定。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | `boundKeyboard` 的另外两个重载 |

## 动作条目

```ts
type ShortcutOperationEntry = {
  actionId: string
  action: () => void
  keys?: string[]
}
```

- `actionId` 唯一；绑定和触发都用它。
- `keys` 是可选预设键，作为动作的默认键位。

```ts
const { defineShortcutAction, addAction } = useKeyboard()

defineShortcutAction([
  { actionId: 'save', action: () => save(), keys: ['s'] },
  { actionId: 'reset', action: () => reset(), keys: ['r'] },
])

addAction({ actionId: 'quit', action: () => process.exit(0) })
```

| 方法 | 返回 | 作用 |
|---|---|---|
| `defineShortcutAction(entries)` | `boolean` | 原子地一次注册多个；任一 id 已存在返回 `false`，什么也不注册 |
| `addAction(entry)` | `boolean` | 注册一个；id 重复返回 `false` |
| `hasAction(actionId)` | `boolean` | 是否已注册 |
| `removeAction(actionId)` | `boolean` | 移除；未注册返回 `false` |
| `modifyAction(actionId, keys)` | `boolean` | 修改预设键；动作不存在或没有 `keys` 时返回 `false`；只影响之后的绑定 |

动作注册表属于当前引擎实例，`useKeyboard()` 拿到的是当前 `KeyboardProvider` 的那一份。

## 三种绑定形式

| 形式 | 作用 |
|---|---|
| `boundKeyboard(keys, handler, options?)` | 普通回调绑定 |
| `boundKeyboard(actionId, options?)` | 用动作的预设键绑定 |
| `boundKeyboard(keys, actionId, options?)` | 用显式键绑定动作，覆盖预设键 |

```ts
boundKeyboard('save')            // 使用 save 的预设键
boundKeyboard(['x'], 'save')     // 显式绑定到 x
boundKeyboard(['t'], 'toggle')   // 动作没有预设键时只能用显式键
```

- `boundKeyboard(actionId)` 要求动作注册时带 `keys`，否则抛错 `does not have predefined keys`。
- 两种形式在 `actionId` 未注册时都会抛错：`[keyboard-engine] Action "<id>" is not registered.`

## 序列动作

`boundSequence` 使用另一套序列动作：

```ts
defineSequenceAction([{ sequenceActionId: 'goto-top', action: scrollTop, keys: ['g', 'g'] }])

boundSequence('goto-top')                    // 使用预设键
boundSequence(['ctrl+g', 'g'], 'goto-top')   // 显式键覆盖预设键
```

| 方法 | 返回 | 说明 |
|---|---|---|
| `defineSequenceAction(entries)` | `boolean` | 原子操作；任一 id 已存在返回 `false` |
| `addSequenceAction(entry)` | `boolean` | id 重复返回 `false` |
| `hasSequenceAction(id)` | `boolean` | 是否已注册 |
| `removeSequenceAction(id)` | `boolean` | 未注册返回 `false` |
| `modifySequenceAction(id, keys, timeout?)` | `boolean` | 动作不存在或没有预设键返回 `false`；`timeout: 0` 会被采纳 |
| `clearSequenceOperations()` | `void` | 清空所有序列动作 |

动作 id 与序列动作 id 是两套独立的命名空间。

## 快捷键动作还是序列动作？

| 需求 | 快捷键动作 | 序列动作 |
|---|---|---|
| 单个按键触发回调 | 是 | — |
| 按键序列触发回调 | — | 是 |
| 预设键 | `keys` | `keys` + 可选 `timeout` |
| 绑定方法 | `boundKeyboard` | `boundSequence` |
| 注册方法 | `defineShortcutAction` | `defineSequenceAction` |

两套注册表都按引擎实例隔离，互不相干。触发是一次按键就用快捷键动作；触发本身就是多键手势时用序列动作。

## 边界

- 动作注册一次可被多个键、多个绑定引用。
- `modifyAction` 不回溯修改已经创建的绑定。
- 动作回调里抛出的异常会向上传播；需要隔离时在回调内部处理。
- 清理绑定仍要返回解绑函数；动作本身不会随绑定自动移除。
- 模块级调用可以直接注册动作，见[模块级键盘 API](/zh/keyboard/module-api)。
