# 学习普通图层的概念，了解 `openLayer` 等方法

在我们的真实应用中，有许多悬浮在屏幕上的工具面板、看板、工具栏、弹窗等。Ink V7 引入了绝对定位功能，并允许 `Box` 容器脱离文档流，这为 ink-cartridge 实现图层提供了入口。基于此，ink-cartridge 提供了一个完整的图层系统。

**图层**是悬浮在屏幕之上、独立于屏幕树的容器。它不参与导航，始终渲染在当前屏幕之上，多个图层之间依靠 `zIndex` 决定堆叠与交互的优先级——`zIndex` 越大，视觉上越靠前，键盘与鼠标的优先级也越高。

图层系统分为两类：

- **普通图层**：通过 `openLayer` 开启、`closeLayer` 关闭，适合工具面板、看板、工具栏等常驻浮层；
- **模态层**：通过 `openModalLayer` 开启、`closeModalLayer` 关闭，渲染在普通图层之上，且只有 `zIndex` 最高的模态层能接收键盘事件，适合弹窗、确认框等需要独占键盘的场景。

开启一个图层后，还需要用 `applyElement` 向图层内挂载元素，用 `eraseElement` 移除元素；`activateElement` / `deactivateElement` 控制元素的键盘是否激活；`closeAllLayer` 一次性关闭所有普通图层。

本章聚焦**普通图层**：先介绍图层的基本概念，再逐个讲解 `openLayer`、`applyElement`、`closeLayer` 等核心方法。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [组织屏幕](/zh/screen/screen-registry) | 图层悬浮在屏幕之上，先要知道屏幕是什么 |
| [屏幕导航](/zh/screen/navigation) | 图层能否跨页保留与跳转直接相关 |

## 图层的概念

在开始之前，先弄清一个关键事实：**`openLayer` 只是开启了一个空容器，它本身不会渲染任何内容**。一个图层要真正显示出来，需要两步：

1. **开启图层**：用 `openLayer` 向屏幕系统注册一个图层；
2. **挂载元素**：用 `applyElement` 把组件挂载进这个图层。

图层本身是一个铺满终端的绝对定位容器。`CurrentScreen` 会按照**当前屏幕 → 普通图层 → 模态层**的顺序渲染：每个图层先渲染成一整块铺满终端的容器，容器内的元素（也就是你用 `applyElement` 挂载进去的组件）再借助 Ink V7 的绝对定位把自己摆在屏幕的任意位置。

图层是**独立于屏幕树**的。它不参与 `skip` / `back` / `gotoScreen` 的导航，而是始终悬浮在当前屏幕之上。多个图层之间依靠 `zIndex` 决定堆叠顺序与交互优先级：`zIndex` 越大，视觉上越靠前，键盘与鼠标的优先级也越高。

下面是最小可运行的例子：在 Home 屏幕上按 `a` 键，开启一个工具面板图层。

```tsx
import React, { useEffect } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
  useScreenSystem,
} from 'ink-cartridge';

function Home() {
  const { openLayer, applyElement } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    // 按 a 键开启图层，并往图层里挂载一个元素
    return boundKeyboard(['a'], () => {
      openLayer('tool-panel', 10);
      applyElement('tool-panel', {
        element: ToolPanel,
        elementId: 'tool-panel-body',
      });
    });
  }, [boundKeyboard, openLayer, applyElement]);

  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
      <Text>按 a 开启工具面板</Text>
    </Box>
  );
}
registerComponent(Home, {});

// 图层内的元素也是一个普通的 React 组件，用绝对定位把自己悬浮起来
function ToolPanel() {
  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>🧰 工具面板</Text>
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

按下 `a` 键后，终端右上角会出现一个黄色边框的浮动面板，悬浮在 Home 屏幕之上。其中：

- `openLayer('tool-panel', 10)` 开启了一个名为 `tool-panel` 的图层，`zIndex` 为 10；
- `applyElement('tool-panel', { element: ToolPanel, elementId: 'tool-panel-body' })` 把 `ToolPanel` 组件挂载进这个图层；
- `ToolPanel` 没有调用 `registerComponent`，它只是一个普通组件，通过绝对定位把自己摆到了右上角。

通过 `useScreenSystem()` 的 `allLayers` 可以随时读取当前已开启的所有普通图层，常用于判断某个图层是否已经存在。

## 使用 `openLayer` 方法开启一个图层

`openLayer` 的签名：

```typescript
openLayer(layerId: string, zIndex: number, options?: LayerOptions): void
```

- `layerId` {string} 图层的唯一标识，同一个 ID 只能开启一次。
- `zIndex` {number} 图层的优先级；越大越靠前，键盘与鼠标优先级也越高。
- `[options]` {LayerOptions} 可选配置，见下。

`LayerOptions` 的可选字段：

- `[crossPage]` {boolean} 为 `true` 时，图层在页面切换（`skip` / `back` / `gotoScreen`）时不会被自动清除。 **默认值：** `false`。
- `[automaticTakeoverKeyboard]` {boolean | ComponentType[]} 控制图层键盘绑定的作用范围（详见后续文章）。 **默认值：** `false`。

> **Note:** `openLayer` 只开启一个空容器。开启之后还需要用 `applyElement` 挂载元素，否则屏幕上不会显示任何内容。

## 使用 `applyElement` 方法向图层挂载元素

`applyElement` 把元素挂载进一个**已开启**的图层：

```typescript
applyElement<C extends ComponentType<any>>(targetLayerId: string, layerElement: LayerElementInput<C>): void
```

`layerElement` 需要提供：

- `element` {ComponentType&lt;C&gt;} 挂载进图层的组件。
- `elementId` {string} 元素在图层内的唯一标识。
- `[props]` {ComponentProps&lt;C&gt;} 传给元素的 props，与 `skip()` 的 `params` 一样会做类型校验。
- `[active]` {boolean} 为 `false` 时元素暂停接收键盘事件。 **默认值：** `true`。

`props` 的类型会严格校验：传入的 props 必须与 `element` 组件声明的 props 一致，否则编译期就会报错。例如：

```tsx
applyElement('tool-panel', {
  element: ToolPanel,
  elementId: 'tool-panel-body',
  props: { title: '我的工具' }, // 必须与 ToolPanel 的 props 类型一致
});
```

```tsx
function ToolPanel({ title }: { title: string }) {
  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>{title}</Text>
    </Box>
  );
}
```

## 使用 `LayerElementContext` 读取图层信息

挂载进图层的组件，会被包裹在 `LayerElementContext` 的 Provider 中。组件内部可以通过 `useContext(LayerElementContext)` 读取自己所属图层的信息，例如图层的 ID。

```tsx
import React, { useContext, useEffect } from 'react';
import { Box, Text } from 'ink';
import { LayerElementContext, useKeyboard, useScreenSystem } from 'ink-cartridge';

function ToolPanel() {
  const { closeLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const layerCtx = useContext(LayerElementContext);

  useEffect(() => {
    // 按 Escape 键关闭自己所在的图层
    return boundKeyboard(['escape'], () => {
      if (layerCtx?.layer) {
        closeLayer(layerCtx.layer.layerId);
      }
    });
  }, [boundKeyboard, closeLayer, layerCtx]);

  return (
    <Box
      position="absolute"
      top={2}
      left={30}
      width={30}
      height={8}
      borderStyle="bold"
      borderColor="yellow"
    >
      <Text>🧰 工具面板（按 Esc 关闭）</Text>
    </Box>
  );
}
```

`layerCtx.layer` 是当前元素所属的图层对象，`layerCtx.layer.layerId` 就是它的 ID。借助它，一个元素不需要提前知道自己在哪个图层里，就能在回调里拿到自己的图层并执行操作。

## 使用 `closeLayer` 方法关闭图层

`closeLayer` 关闭一个图层，并清空它上面的所有元素：

```tsx
closeLayer('tool-panel');
```

关闭后，图层里挂载的所有元素都会随之消失。对未注册的 ID 调用 `closeLayer` 是无操作（开发环境会给出告警）。

## 使用 `eraseElement` 与 `closeAllLayer` 移除元素

`eraseElement` 只移除图层里的单个元素，图层本身仍然保留：

```tsx
// 移除 tool-panel 图层里的 tool-panel-body 元素，图层保持开启
eraseElement('tool-panel', 'tool-panel-body');
```

`closeAllLayer` 一次性关闭所有普通图层：

```tsx
closeAllLayer();
```

如果同一时间开启了多个图层，`closeAllLayer` 可以快速清理全部内容。

## API 参考

| 方法 | 签名 | 说明 |
| --- | --- | --- |
| `openLayer` | `openLayer(layerId, zIndex, options?)` | 开启一个普通图层 |
| `applyElement` | `applyElement(targetLayerId, layerElement)` | 向图层挂载一个元素 |
| `closeLayer` | `closeLayer(targetLayerId)` | 关闭一个图层及其全部元素 |
| `eraseElement` | `eraseElement(targetLayerId, targetElementId)` | 从图层移除单个元素 |
| `closeAllLayer` | `closeAllLayer()` | 关闭所有普通图层 |
| `activateElement` | `activateElement(targetLayerId, targetElementId)` | 重新激活元素的键盘事件（见后续文章） |
| `deactivateElement` | `deactivateElement(targetLayerId, targetElementId)` | 暂停元素的键盘事件（见后续文章） |

## 注意事项

1. **`layerId` 必须唯一。** 重复 `openLayer` 同一个 ID 是无操作（开发环境会告警），需要先 `closeLayer` 才能重新开启。普通图层与模态层共用 ID 命名空间，复用模态层的 ID 会直接抛错。
2. **必须先 `openLayer`，再 `applyElement`。** 向未开启的图层挂载元素会抛错，错误信息会提示你先调用 `openLayer` 注册图层。
3. **`elementId` 在同一图层内必须唯一。** 重复 `applyElement` 同一个 `elementId` 是无操作（开发环境会告警）。
4. **`openLayer` 只开启一个空容器。** 没有挂载任何元素时，图层不会显示任何内容。
5. **普通图层默认会在页面切换时被清除。** 执行 `skip` / `back` / `gotoScreen` 时，`crossPage` 为 `false` 的图层会被自动清除；设置为 `true` 即可跨页面保留（详见后续文章）。
6. **图层方法既可以作为钩子使用，也可以模块级导入。** 上述方法既可以从 `useScreenSystem()` 获取，也可以从 `ink-cartridge` 直接导入使用。
