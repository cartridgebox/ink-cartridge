# 监听模态层的丢失键

在上一章，我们学习了如何用 `allowModal` 放行键盘事件。在这一章中，我们将学习 `useModalMissListener`：在模态层里监听「未被处理的按键」，也就是丢失键。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 「丢失键」就是屏障吞掉的那些键 |
| [allowModal 放行键盘事件](/zh/screen/allow-modal) | 上一章的内容 |

## 什么是丢失键

模态层打开时，未被它处理的按键会被屏障吞掉。大多数时候我们并不关心这些按键，但有些场景想在按键被吞掉时做点事——比如在弹窗底部显示「这个按键未绑定」的提示，或者统计用户在模态层里按了哪些无效键。

`useModalMissListener` 就是用来监听这些丢失键的：**在模态层内注册一个回调，每当一个按键未被模态层处理时触发**。

## `useModalMissListener` 的用法

```typescript
useModalMissListener(cb: ModalMissCallback, options?: ModalMissOptions): () => void
```

回调 `cb` 接收一个 `ModalMissEvent`，它的 `miss` 字段区分两种情况：

| 事件 | 含义 |
| --- | --- |
| `{ miss: false }` | 按键被模态层处理了，不是丢失键 |
| `{ miss: true, key, input, eventNames }` | 按键未被模态层处理，是丢失键；`key` / `input` / `eventNames` 描述这个按键 |

`options` 的可选字段：

- `[monitorWhen]` {boolean} 为 `true` 时，命中某个 `when` 条件为 `false` 的绑定的按键也视为丢失键；否则视为已处理。 **默认值：** `false`。
- `[monitorFocusMismatch]` {boolean} 为 `true` 时，命中非激活焦点目标的绑定的按键也视为丢失键。 **默认值：** `false`。
- `[elementId]` {string} 监听归属的元素。在模态层元素内通过 `useKeyboard()` 调用时自动注入，通常无需手动传。

`useModalMissListener` 必须在**模态层内**调用才生效。在普通图层内调用不会报错，但监听不会真正激活。

下面是最小可运行的例子：按 `1` 打开帮助弹窗，弹窗底部显示最近一次丢失的键名。

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

  useEffect(() => {
    // 按 1 开启帮助弹窗
    return boundKeyboard('1', () => {
      openModalLayer('help', 100);
      applyElementToModalLayer('help', {
        element: HelpModal,
        elementId: 'help-body',
      });
    });
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>按 1 打开帮助弹窗</Text>
    </Box>
  );
}
registerComponent(Home, {});

function HelpModal() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard, useModalMissListener } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);
  const [lastMiss, setLastMiss] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const close = boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
    // 监听丢失键：未被模态层处理的按键会触发回调
    const unlisten = useModalMissListener((evt) => {
      if (evt.miss) {
        setLastMiss(evt.eventNames.join(' / '));
      }
    });
    return () => {
      close();
      unlisten();
    };
  }, [boundKeyboard, closeModalLayer, useModalMissListener, ctx]);

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
      flexDirection="column"
    >
      <Text>❓ 帮助（按 return 关闭）</Text>
      <Text dimColor>
        {lastMiss ? `未绑定键: ${lastMiss}` : '按任意未绑定键试试'}
      </Text>
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
- 按 `z`（弹窗未绑定）：触发丢失键回调，弹窗底部显示"未绑定键: z"；
- 按 `return`（弹窗已绑定）：回调收到 `miss: false`，底部提示保持不变；
- 弹窗打开期间，按 `z` 这类丢失键仍被屏障吞掉，不会落到下面的屏幕——监听只是通知，不改变事件流向。

## 小结

| 方法 | 作用 |
| --- | --- |
| `useModalMissListener(cb, options?)` | 在模态层内监听未被处理的按键 |
| `ModalMissEvent` | `miss: false` 表示已处理；`miss: true` 表示丢失键，附带 `key` / `input` / `eventNames` |

## 注意事项

1. **必须在模态层内使用。** 在普通图层内调用不会生效；在模态层之外调用会返回空操作。
2. **丢失键仍被屏障吞掉。** 监听只是通知你「有个键没被处理」，不会改变事件流向。
3. **`monitorWhen` / `monitorFocusMismatch` 默认为 `false`。** 需要把「命中 `when` 为假 / 非激活焦点目标」的按键也算作丢失键时，才把它们设为 `true`。
4. **`useModalMissListener` 是 `useKeyboard()` 提供的方法，应在 `useEffect` 中调用并返回解绑函数。** 组件卸载时监听随之清理。
