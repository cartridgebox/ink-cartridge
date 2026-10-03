# 使用 `allowModal` 放行键盘事件

在上一章，我们学习了如何停用和激活模态层内元素的键盘响应。在这一章中，我们将学习 `allowModal`：让指定按键穿过模态层的键盘屏障，落到下面的普通图层或屏幕。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | `allowModal` 放行的就是那道键盘屏障 |

## 为什么需要放行

模态层打开期间，未被它处理的按键会被屏障吞掉。大多数时候这正是期望的行为——确认框打开时，用户不该能操作下面的界面。但有些场景需要例外：帮助弹窗打开时，允许方向键滚动下面的页面；设置弹窗打开时，允许某个快捷键直达主界面。

`allowModal` 就是用来声明这些例外的：**把指定的键加入放行名单，让它们在未被模态层处理时穿过屏障**。

## `allowModal` 的用法

```typescript
allowModal(keys: string[], options?: AllowModalOptions): () => void
```

- `keys` —— 要放行的按键名数组；
- `options` —— 可选配置，见下表；
- 返回值 —— 解绑函数，调用后移除放行规则。

`AllowModalOptions` 的可选字段：

- `[elementId]` {string} 放行规则归属的元素。在模态层元素内通过 `useKeyboard()` 调用时自动注入，通常无需手动传。
- `[focusId]` {string | FocusRef} 把放行规则限定到指定的焦点目标；只有在该焦点目标内放行才生效。字符串形式指默认焦点层里的焦点 ID，对象形式 `{ group, focusId }` 限定到指定焦点组。
- `[when]` {(() => boolean) | string} 条件。可以是函数，也可以是已注册的条件 ID。为 `false` 时该放行规则失效，按键仍被屏障拦截。

`allowModal` 必须在模态层的组件内调用。通过 `useKeyboard()` 获取的 `allowModal` 会自动把规则归属到当前模态层的元素上，无需手动传 `elementId`：

```tsx
// 放行 t：模态层不处理 t 时，t 会穿过屏障到达下面的界面
const unallow = allowModal(['t']);
```

下面是最小可运行的例子：Home 绑定 `t` / `x` 记录日志；按 `1` 打开帮助弹窗，弹窗放行 `t`，但屏障仍拦截 `x`。

```tsx
import React, { useContext, useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ModalLayerElementContext,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
  useScreenSystem,
} from 'ink-cartridge';

function Home() {
  const { openModalLayer, applyElementToModalLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const open = boundKeyboard('1', () => {
      openModalLayer('help', 100);
      applyElementToModalLayer('help', {
        element: HelpModal,
        elementId: 'help-body',
      });
    });
    const onT = boundKeyboard('t', () => setLog((l) => [...l, '页面收到 t']));
    const onX = boundKeyboard('x', () => setLog((l) => [...l, '页面收到 x']));
    return () => {
      open();
      onT();
      onX();
    };
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>按 1 打开帮助弹窗 · t 被放行 · x 被吞掉</Text>
      {log.map((line, i) => (
        <Text key={i} dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
registerComponent(Home, {});

function HelpModal() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard, allowModal } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);

  useEffect(() => {
    if (!ctx) return;
    // 放行 t，让它穿过屏障到达下面的屏幕
    const unallow = allowModal(['t']);
    const close = boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
    return () => {
      unallow();
      close();
    };
  }, [allowModal, boundKeyboard, closeModalLayer, ctx]);

  return (
    <Box
      position="absolute"
      top={4}
      left={40}
      width={40}
      height={6}
      borderStyle="round"
      borderColor="magenta"
      backgroundColor="black"
    >
      <Text>❓ 帮助（按 return 关闭）</Text>
    </Box>
  );
}

render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>
);
```

运行后：

- 按 `1` 打开帮助弹窗；
- 按 `t`：弹窗不处理 `t`，但它在放行名单里 → 穿过屏障 → Home 收到 `t`，日志出现"页面收到 t"；
- 按 `x`：弹窗不处理 `x`，也不在放行名单里 → 屏障吞掉 → Home 收不到 `x`，日志没有"页面收到 x"；
- 按 `return` 关闭弹窗。

## 放行的语义

放行遵循两条规则：

1. **模态层自己的处理优先。** 如果模态层内的元素处理了某个按键（比如弹窗绑定了 `return`），这个按键就被模态层消费，即使它在放行名单里也不会穿过去。
2. **只有「未被处理」的放行键才穿过。** 一个按键要穿过屏障，必须同时满足：模态层没有处理它，且它在放行名单里。

## 小结

| 方法 | 作用 |
| --- | --- |
| `allowModal(keys, options?)` | 把指定按键加入放行名单，让它们在未被模态层处理时穿过屏障 |
| 返回解绑函数 | 调用后移除放行规则 |

## 注意事项

1. **`allowModal` 必须在模态层的组件内调用。** 在其他地方调用会抛错。
2. **模态层自己的处理优先于放行。** 被模态层处理过的按键不会穿过屏障。
3. **`when` 条件。** 传入 `when` 后，只有条件为真时放行规则才生效；为 `false` 时该键仍被屏障拦截。
4. **放行不等于跳过模态层。** 放行是「模态层没处理时，允许该键落到下面」，按键仍会先经过模态层。
