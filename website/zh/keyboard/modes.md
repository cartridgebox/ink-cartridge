# 模式

模式（mode）是一组具名的键位命名空间。带 `mode` 的绑定只在当前模式匹配时生效；不带的在所有模式（含「无模式」）下生效。最常见的用途是复刻 vim 的 normal / insert。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | `mode` 是绑定选项之一 |

## 绑定的 mode 选项

- `mode` {string} 省略时在所有模式（含无模式）下生效；给出时仅当 `getCurrentMode()` 等于该值时生效。

`boundKeyboard`、`boundSequence`、`globalKeys`、`globalSequence`、`penetration`、`stop`、`allowModal`，以及组合 / 映射条目都接受该选项。

## addMode(mode)

注册一个模式名。

- `mode` {string} 模式名。
- 返回：{boolean} 新增成功返回 `true`；模式已存在返回 `false`（幂等）。

## removeMode(mode)

注销一个模式名。

- `mode` {string} 模式名。
- 返回：{boolean} 原本存在并已移除返回 `true`。
- 注意：**不会**自动退出该模式。若被删模式正在激活，`getCurrentMode()` 仍返回该名字，需手动 `setMode(null)`。

## setMode(mode)

切换当前模式。

- `mode` {string | null} 目标模式；`null` 表示进入无模式。
- 返回：{boolean} 模式已注册（或为 `null`）时切换并返回 `true`；未注册时返回 `false` 且**不改动**当前模式。

## nextMode()

循环切换到下一个模式。从无模式进入**第一个**注册模式。

- 返回：无。

## prevMode()

循环切换到上一个模式。从无模式进入的是**倒数第二个**模式（不是最后一个）——这是绕环计算的边角。

- 返回：无。

## getCurrentMode()

- 返回：{string | null} 当前模式名；无模式时为 `null`。

## 示例

```tsx
const { addMode, removeMode, setMode, nextMode, boundKeyboard } = useKeyboard()

useEffect(() => {
  addMode("insert")
  const unbind = boundKeyboard("*", handleChar, { mode: "insert" })  // 仅 insert 模式
  return () => { unbind(); removeMode("insert") }
}, [addMode, removeMode, boundKeyboard])

// 一个快捷键在模式间循环
useEffect(() => boundKeyboard("escape", nextMode), [boundKeyboard, nextMode])
```

## 行为边界

- 构造时传入的 `defaultMode` 不校验是否已注册。
- 在非 React 宿主中，`KeyboardEngine` 的构造项 `EngineProps` 接受 `modes?: string[]` 与 `defaultMode?: string`，相当于初始注册与初始模式；其余方法同名同义。
