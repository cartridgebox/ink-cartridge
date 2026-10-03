# 学习使用多键序列 `boundSequence`

在《快捷键与动作》一章里我们说，多键连按的序列留到后续专门讲解——本章就来补上。序列与普通快捷键最大的区别是：**它要依次按下多个键才触发**，键与键之间有时限。

前面你已经熟悉了焦点系统、焦点组与绑定归属，这一章默认这些概念都已掌握，不再赘述。本章只聚焦序列最常用的一种调用形式：`boundSequence(keys, handler, options?)`。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 序列仍然是绑定的一种形式 |
| [默认组与命名组](/zh/keyboard/focus-group) | 序列可以绑定到某个焦点目标上 |
| [绑定方法的归属与所有者栈](/zh/screen/binding-attribution) | 序列在哪里调用，就归属到哪里 |

## 什么是序列

想象一下 vim 里的 `d d`：连按两次 `d` 才删除。引擎按下第一个键后不会立即执行，而是进入"待续"状态，等待后续键。

一个序列的完整生命周期：

1. 按下第一个键 → 进入待续状态，开始计时；
2. 在超时时间内按下第二个键 → 序列匹配，执行回调；
3. 每匹配一个键，计时器重置；
4. 超时未完成，或按下不匹配的键（`exclusive: false` 时）→ 序列作废。

## 基本用法：`boundSequence(keys, handler, options?)`

`boundSequence` 的签名与 `boundKeyboard` 非常像，只是 `keys` 是一串键而不是一个：

```typescript
boundSequence(
  keys: string[],                       // 依次按下的按键序列，至少两个
  handler: KeyHandler,                  // 完整序列匹配后执行的回调
  options?: SequenceOptions,            // 全部选项见下文
): () => void
```

```tsx
const { boundSequence } = useKeyboard()

useEffect(() => {
  return boundSequence(["d", "d"], () => deleteItem())
}, [boundKeyboard])
```

两条基本规则：

- **序列至少需要两个键**：`boundSequence(["a"], ...)` 会抛错 `requires at least 2 keys in the sequence`；
- 返回解绑函数，清理方式与 `boundKeyboard` 完全一致（放进 `useEffect` 并返回）。

## 归属与焦点：和 `boundKeyboard` 一模一样

这一点很重要：**`boundSequence` 的归属与 `boundKeyboard` 完全相同**。

- 它通过同一个 `getCurrentOwner()` 解析归属，落在当前所有者的图层上；
- 传 `elementId` 时落在该图层元素上，传 `focusId` 时会**隐式创建焦点目标**（`getOrCreateFocusTarget`）并参与焦点路由——只有当前激活焦点的序列才会被匹配。

所以你在《绑定归属与所有者栈》《焦点系统》《默认组与命名组》里学到的每一条规则，都原封不动地适用于序列，这里不再展开。

## 全部选项

`SequenceOptions` 继承自 `BoundKeyboardOptions`，并新增了 `timeout` 与 `exclusive`：

- `timeout` {number} 相邻按键之间的最大间隔（毫秒）。 **默认值：** `500`。
- `exclusive` {boolean} 待续期间按错键时：`false` 取消序列并落到普通绑定；`true` 静默吞掉并继续等待。 **默认值：** `false`。
- `when` {(() => boolean) | string} 条件（函数或命名条件 id）。序列只在条件为真时启动与续写。
- `mode` {string} 只在指定模式下生效（模式需预先注册）。
- `focusId` {string | FocusRef} 把序列绑定到指定的焦点目标 / 焦点组，仅当该目标激活时匹配。
- `elementId` {string} 把序列绑定到当前图层的指定元素。
- `stopsWorkingAfterLayerAppearing` {boolean} 仅页面绑定：一旦任何图层出现，序列失效。

### `timeout` 与 `exclusive`

这两个是序列专属选项。

`timeout` 控制"多快才算连按"——按下第一个键后开始计时，每匹配一个键就重置：

```tsx
// 700ms 内按完 g g 才触发；默认是 500ms
boundSequence(["g", "g"], () => jumpToTop(), { timeout: 700 })
```

`exclusive` 决定待续期间按错键会发生什么：

```tsx
// 默认 false：按 g 后再按错键，序列取消，错键落到其它绑定
boundSequence(["g", "g"], () => jumpToTop())

// true：按 w 后再按错键，错键被静默吞掉，随后再按 w 仍会触发锁定
boundSequence(["w", "w"], () => lock(), { exclusive: true })
```

### `when`、`mode`、`focusId`、`elementId`、`stopsWorkingAfterLayerAppearing`

这些选项与 `boundKeyboard` 同名选项的行为完全一致，只是作用于序列：

```tsx
// 仅在编辑模式下生效
boundSequence(["d", "d"], () => deleteItem(), { mode: "insert" })

// 条件为真时才响应
boundSequence(["c", "c"], () => copy(), { when: () => hasSelection })

// 绑定到焦点组 form 内的字段，仅当该字段激活时匹配
boundSequence(["e", "e"], () => edit(), { focusId: { group: "form", focusId: "name" } })
```

### 关于 `times` / `once` / `observer`

`SequenceOptions` 在类型上继承了 `boundKeyboard` 的 `times`、`once`、`observer`，但**序列的匹配机制不会处理它们**——这三个选项对 `boundSequence` 不生效，请只把它们用于 `boundKeyboard`。

## 完整例子

到这里，我们把序列串成一个**完整可运行**的应用——一张"序列控制台"：左侧列出已注册的序列，右侧是实时事件日志。每个序列都用 `boundSequence(keys, handler, options?)` 绑定，`g g` 调大了 `timeout`，`w w` 开了 `exclusive`。将下面的代码保存为 `.tsx` 文件，执行 `npx tsx <文件名>.tsx` 即可运行。

::: details 点击展开完整示例代码（约 120 行）
```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
} from 'ink-cartridge';

function ConsoleScreen() {
  const { boundSequence } = useKeyboard();
  const [log, setLog] = useState<string[]>([]);

  const push = useCallback((msg: string) => {
    setLog((prev) => [msg, ...prev].slice(0, 6));
  }, []);

  useEffect(() => {
    // 全部用基本形式 boundSequence(keys, handler, options?)
    const unDel = boundSequence(['d', 'd'], () => push('删除 (d d)'));
    const unTop = boundSequence(['g', 'g'], () => push('回到顶部 (g g)'), { timeout: 700 });
    const unHello = boundSequence(['c', 'c'], () => push('问候 (c c)'), { timeout: 600 });
    const unLock = boundSequence(['w', 'w'], () => push('锁定 (w w)'), { exclusive: true });

    return () => { unDel(); unTop(); unHello(); unLock(); };
  }, [boundSequence, push]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题栏 */}
      <Box borderStyle="single" borderColor="cyan" paddingX={2}>
        <Text bold color="cyan">SEQUENCE CONSOLE</Text>
        <Text dimColor>  ·  多键序列 boundSequence</Text>
      </Box>

      {/* 双栏：序列列表 + 事件日志 */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        {/* 左侧：已注册序列 */}
        <Box width={30} borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={1}>
          <Text bold underline color="cyan">已注册序列</Text>
          <Box flexDirection="column" marginTop={1} gap={0}>
            <Text>▶ [d d] 删除</Text>
            <Text dimColor>  [g g] 回到顶部（timeout 700）</Text>
            <Text dimColor>  [c c] 问候（timeout 600）</Text>
            <Text dimColor>  [w w] 锁定（exclusive）</Text>
          </Box>
        </Box>

        {/* 右侧：事件日志 */}
        <Box flexGrow={1} borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} paddingY={1}>
          <Text bold underline color="magenta">事件日志</Text>
          <Box flexDirection="column" marginTop={1} gap={0}>
            {log.length === 0 && <Text dimColor>（尚无事件）</Text>}
            {log.map((line, i) => (
              <Text key={i} color={i === 0 ? 'green' : undefined}>· {line}</Text>
            ))}
          </Box>
        </Box>
      </Box>

      {/* 底栏：按键提示 */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={2}>
        <Text dimColor>
          d d 删除 · g g 回到顶部 · c c 问候 · w w 锁定 · q 退出
        </Text>
      </Box>
    </Box>
  );
}

registerComponent(ConsoleScreen, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(['q'], () => process.exit(0));
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={ConsoleScreen} fullScreen>
    <KeyboardProvider>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
```
:::

### 操作指南

| 按键 | 效果 | 选项 |
|------|------|------|
| `d` `d` | 删除 | 默认（timeout 500，exclusive false） |
| `g` `g` | 回到顶部 | `timeout: 700` |
| `c` `c` | 问候 | `timeout: 600` |
| `w` `w` | 锁定 | `exclusive: true` |
| `q` | 退出 | — |

### 你应该观察到的效果

1. **序列要"一口气"按完**：快速连按 `d d` 才会删除。只按一个 `d` 后稍作停顿再按，超过超时时间序列作废，什么都不会发生——这是序列与普通快捷键最明显的区别。

2. **超时可配**：`g g` 有 `700ms` 超时，比 `d d` 的默认 `500ms` 更宽容，按两个键之间可以多停顿一会；`c c` 单独设了 `600ms`。

3. **`exclusive` 决定按错键的命运**：`d d` 是默认行为（`false`），按 `d` 后再按一个不匹配的键，序列被取消；`w w` 开了 `true`，按 `w` 后再按错键会被静默吞掉，随后再按 `w` 仍能触发锁定。

4. **归属与焦点规则不变**：这个示例里序列都注册在屏幕层；换成带 `focusId` 的写法，只有激活的焦点目标才能命中——和 `boundKeyboard` 完全一致。
