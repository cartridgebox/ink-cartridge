# 键名规范

绑定里书写的键名（`"s"`、`"ctrl+q"`、`"return"`）不是终端直接给出的，而是 `normalizeKeyNames` 把 Ink 的按键信息归一化后的结果。本页记录这套转换，以及判断按键种类的两个谓词。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 绑定里写的字符串键名，正是本页讲的归一化结果 |

## normalizeKeyNames(input, key)

把 Ink 的按键信息归一化为有序的键名数组。

- `input` {string} 可打印字符；方向键等特殊键为空字符串。
- `key` {unknown} Ink 的修饰键描述对象。
- 返回：{string[]} 归一化后的键名，按匹配优先级排序。

转换规则：先查特殊键表（`return`、`escape`、`backspace`、`delete`、`up`、`down`、`left`、`right`、`tab`、`pagedown`、`pageup`、`home`、`end`），命中即返回。描述对象带任何修饰键（`ctrl` / `shift` / `meta`）时裸名被排除，改为产出对应变体，并额外产出 `ctrl+shift+<name>`；否则用 `input` 原字符套修饰键变体。`input` 为空且无匹配时返回空数组。

```ts
normalizeKeyNames("s", {})                            // ["s"]
normalizeKeyNames("s", { ctrl: true })                // ["ctrl+s"]
normalizeKeyNames("", { return: true })               // ["return"]
normalizeKeyNames("", { return: true, shift: true })  // ["shift+return"]
normalizeKeyNames("", { tab: true, shift: true })     // ["shift+tab"]
```

## isInkSpecialKey(key)

判断 Ink 的按键描述是否属于特殊键。

- `key` {unknown} Ink 的按键描述对象。
- 返回：{boolean} 命中方向键、`pageDown` / `pageUp` / `home` / `end`、`return` / `escape` / `tab` / `backspace` / `delete`、修饰键（`ctrl` / `meta` / `super` / `hyper`）之一，或 `eventType === "release"` 时为 `true`。

## isNormalCharacter(input, key)

- `input` {string} 可打印字符。
- `key` {unknown} Ink 的按键描述对象。
- 返回：{boolean} `input` 非空且 `key` 不是特殊键时为 `true`。

只有普通字符会参与通配符 `"*"` 的匹配。输入框想区分「真的打了个字母」和「按了方向键」时用它即可。

## 用途

- **自定义宿主**：非 React 集成时，构造 `KeyboardEngine` 需提供 `normalizeKeyNames` 与 `isNormalChar`（可由 `isInkSpecialKey` 派生，如 `(key) => !isInkSpecialKey(key)`）两个必填项。
- **输入判定**：实现输入框 / 文本编辑时，用 `isNormalCharacter` 过滤控制键。
- **稳定书写**：绑定字符串统一用归一化形式，可跨终端保持一致。
