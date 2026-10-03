# 学习模态层的概念，了解 `openModalLayer` 等方法

在上一章，我们学习了如何控制普通图层内元素的键盘接收。在这一章中，我们将学习**模态层**：一种渲染在普通图层之上、适合弹窗与确认框的浮层。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | 模态层是对普通图层的对比与补充 |
| [图层内元素的键盘接收](/zh/screen/layer-element-keyboard) | 上一章的内容 |

## 模态层的概念

在真实应用中，有许多需要**独占键盘**的场景：确认框、模态对话框、设置弹窗。它们打开时，用户必须做出选择或关闭它，其他界面暂时不应该响应按键。普通图层无法满足这种需求——它只悬浮在屏幕之上，并不拦截按键。

**模态层**正是为这类场景设计的图层。它渲染在**普通图层之上**，且只有 `zIndex` 最高的模态层能接收键盘事件：模态层打开期间，它会「接管」键盘——按下未被模态层处理的键不会落到下面的普通图层或屏幕。

模态层的用法与普通图层几乎一致，方法名一一对应：

| 普通图层 | 模态层 |
| --- | --- |
| `openLayer` | `openModalLayer` |
| `applyElement` | `applyElementToModalLayer` |
| `closeLayer` | `closeModalLayer` |
| `eraseElement` | `eraseElementInModalLayer` |
| `closeAllLayer` | `closeAllModalLayer` |

`CurrentScreen` 按照**当前屏幕 → 普通图层 → 模态层**的顺序渲染，所以模态层在视觉上总是盖在最上面。

下面是最小可运行的例子：在 Home 屏幕按 `a` 键，弹出一个确认对话框，按 `return` 确认并关闭。

```tsx
import React, { useContext, useEffect } from 'react';
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
    // 按 a 键开启模态层，并往模态层里挂载一个元素
    return boundKeyboard(['a'], () => {
      openModalLayer('confirm-dialog', 100);
      applyElementToModalLayer('confirm-dialog', {
        element: ConfirmDialog,
        elementId: 'confirm-body',
      });
    });
  }, [boundKeyboard, openModalLayer, applyElementToModalLayer]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>按 a 打开确认弹窗</Text>
    </Box>
  );
}
registerComponent(Home, {});

// 模态层内的元素用 ModalLayerElementContext 读取自己所属的模态层
function ConfirmDialog() {
  const { closeModalLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const ctx = useContext(ModalLayerElementContext);

  useEffect(() => {
    if (!ctx) return;
    // 按 return 关闭自己所在的模态层
    return boundKeyboard(['return'], () => {
      closeModalLayer(ctx.modalLayer.layerId);
    });
  }, [boundKeyboard, closeModalLayer, ctx]);

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
      <Text>⚠️ 确认删除？（按 return 确认）</Text>
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

按下 `a` 键后，终端中央会出现一个洋红色圆角边框的确认弹窗。其中：

- `openModalLayer('confirm-dialog', 100)` 开启了一个名为 `confirm-dialog` 的模态层，`zIndex` 为 100；
- `applyElementToModalLayer('confirm-dialog', { element: ConfirmDialog, elementId: 'confirm-body' })` 把 `ConfirmDialog` 组件挂载进这个模态层；
- `ConfirmDialog` 通过 `useContext(ModalLayerElementContext)` 拿到 `ctx.modalLayer.layerId`，按 `return` 时关闭自己所在的模态层。

一个值得注意的现象：模态层打开后，Home 屏幕上的 `a` 键**不再响应**——模态层接管了键盘。这正是它与普通图层的根本区别，键盘接管的具体规则我们将在下一章展开。

## 使用 `openModalLayer` 方法开启模态层

`openModalLayer` 的签名与 `openLayer` 一致：

```typescript
openModalLayer(layerId: string, zIndex: number, options?: ModalLayerOptions): void
```

- `layerId` {string} 模态层的唯一标识；与普通图层共用 ID 命名空间。
- `zIndex` {number} 模态层的优先级；越大越靠前，键盘优先级也越高。
- `[options]` {ModalLayerOptions} 可选配置，见下。

`ModalLayerOptions` 与 `LayerOptions` 相同：

- `[crossPage]` {boolean} 为 `true` 时，模态层在页面切换（`skip` / `back` / `gotoScreen`）时不会被自动清除。 **默认值：** `false`。
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} 控制模态层键盘接管的作用范围（详见后续文章）。 **默认值：** `false`。

> **Note:** `openModalLayer` 只开启一个空容器。开启之后还需要用 `applyElementToModalLayer` 挂载元素，否则屏幕上不会显示任何内容。

## 使用 `applyElementToModalLayer` 方法挂载元素

`applyElementToModalLayer` 把元素挂载进一个**已开启**的模态层，用法与 `applyElement` 相同：

```typescript
applyElementToModalLayer<C extends ComponentType<any>>(
  targetModalLayerId: string,
  modalLayerElement: LayerElementInput<C>,
): void
```

`modalLayerElement` 需要提供：

- `element` {ComponentType&lt;C&gt;} 挂载进模态层的组件。
- `elementId` {string} 元素在模态层内的唯一标识。
- `[props]` {ComponentProps&lt;C&gt;} 传给元素的 props，会做类型校验。
- `[active]` {boolean} 为 `false` 时元素暂停接收键盘事件（见后续文章）。 **默认值：** `true`。

## 使用 `ModalLayerElementContext` 读取模态层信息

挂载进模态层的组件，会被包裹在 `ModalLayerElementContext` 的 Provider 中。组件内部可以通过 `useContext(ModalLayerElementContext)` 读取自己所属模态层的信息，例如模态层的 ID。这正是上面的例子能「关闭自己」的关键：`ctx.modalLayer.layerId` 就是当前元素所属模态层的 ID。

## 使用 `closeModalLayer` / `closeAllModalLayer` 关闭模态层

`closeModalLayer` 关闭一个模态层，并清空它上面的所有元素：

```tsx
closeModalLayer('confirm-dialog');
```

`closeAllModalLayer` 一次性关闭所有模态层：

```tsx
closeAllModalLayer();
```

对未注册的 ID 调用 `closeModalLayer` 是无操作（开发环境会给出告警）。

## 小结

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `openModalLayer` | `openModalLayer(layerId, zIndex, options?)` | 开启一个模态层 |
| `applyElementToModalLayer` | `applyElementToModalLayer(targetModalLayerId, layerElement)` | 向模态层挂载一个元素 |
| `closeModalLayer` | `closeModalLayer(targetModalLayerId)` | 关闭一个模态层及其全部元素 |
| `eraseElementInModalLayer` | `eraseElementInModalLayer(targetModalLayerId, targetElementId)` | 从模态层移除单个元素 |
| `closeAllModalLayer` | `closeAllModalLayer()` | 关闭所有模态层 |

## 注意事项

1. **`layerId` 与普通图层共用命名空间。** 普通图层与模态层使用同一套 ID，复用模态层的 ID 开普通图层（或反之）会直接抛错。
2. **必须先 `openModalLayer`，再 `applyElementToModalLayer`。** 向未开启的模态层挂载元素会抛错。
3. **`openModalLayer` 只开启一个空容器。** 没有挂载任何元素时，模态层不会显示任何内容。
4. **模态层接管键盘。** 模态层打开期间，未被它处理的按键不会落到下面的普通图层或屏幕；只有 `zIndex` 最高的模态层能接收键盘事件（详见后续文章）。
5. **模态层默认会在页面切换时被清除。** 执行 `skip` / `back` / `gotoScreen` 时，`crossPage` 为 `false` 的模态层会被自动清除；设置为 `true` 即可跨页面保留（详见后续文章）。
6. **模态层方法既可以作为钩子使用，也可以模块级导入。** 上述方法既可以从 `useScreenSystem()` 获取，也可以从 `ink-cartridge` 直接导入使用。
