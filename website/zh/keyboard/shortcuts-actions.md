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

| 方法 | 作用 |
|---|---|
| `defineShortcutAction(entries)` | 一次注册多个；重复 `actionId` 抛错 |
| `addAction(entry)` | 注册一个 |
| `hasAction(actionId)` | 是否已注册 |
| `removeAction(actionId)` | 移除；未注册时抛错 |
| `modifyAction(actionId, keys)` | 修改预设键；只影响之后的绑定 |

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

对应方法为 `addSequenceAction`、`hasSequenceAction`、`removeSequenceAction`、`modifySequenceAction`，以及 `clearSequenceOperations`。动作 id 与序列动作 id 是两套独立的命名空间。

## 边界

- 动作注册一次可被多个键、多个绑定引用。
- `modifyAction` 不回溯修改已经创建的绑定。
- 动作回调里抛出的异常会向上传播；需要隔离时在回调内部处理。
- 清理绑定仍要返回解绑函数；动作本身不会随绑定自动移除。
- 模块级调用可以直接注册动作，见[模块级键盘 API](/zh/keyboard/module-api)。
