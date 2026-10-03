# 使用 `registerComponent` 组织屏幕

ink-cartridge 使用一棵**屏幕树**来组织你的页面结构：每个屏幕只能有一个父屏幕，但可以有多个子屏幕。通过 `skip`、`gotoScreen` 等方法可以在树中不断切换当前屏幕（本章只讲"如何把屏幕注册进树"，导航方法见"屏幕导航"一章）。

这一章会了解 ink-cartridge 最核心的方法之一：`registerComponent`。

## 屏幕树：父子关系

在 ink-cartridge 中，**每一个 React 组件都可以是一个屏幕**。屏幕之间的关系由你声明，`registerComponent` 的 `parent` 参数决定了"这个屏幕的父亲是谁"。

例如下面的树：

```
主菜单
├── 设置
└── 关于
```

- `主菜单` 没有父屏幕，它是**根屏幕**；
- `设置`、`关于` 的父屏幕都是 `主菜单`；
- 导航时只能在父子之间或沿着树跳转（`skip` 向下、`back` 向上、`gotoScreen` 跨分支）。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [快速开始](/zh/quick-start-1) | 屏幕树与 Provider 的整体结构在这里建立 |

屏幕注册进树之后，需要把它真正渲染出来，这由两个组件配合完成：

- **`ScenarioManagementProvider`** —— 屏幕系统的上下文 Provider，包裹整个应用：维护屏幕树的状态（当前路径、图层、模态层等）。`defaultScreen` 指定应用启动时的初始屏幕（必须是已注册的组件，否则会抛错），`fullScreen` 让屏幕占满终端高度。
- **`CurrentScreen`** —— 读取 Provider 的状态并渲染**当前激活的屏幕**。Provider 本身不渲染任何页面，两者必须搭配使用。

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <CurrentScreen />
</ScenarioManagementProvider>
```

> 如果你需要使用键盘系统，`KeyboardProvider` 必须嵌套在 `ScenarioManagementProvider` 内部，否则键盘绑定会失效。

这里只作简要介绍，两者的完整细节将在**后续文章**详细讲解。

## 注册你的第一个屏幕

注册一个屏幕只需要一行代码：

```tsx
import React from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  ScenarioManagementProvider,
  registerComponent,
} from 'ink-cartridge';

function Home() {
  return (
    <Box flexDirection="column">
      <Text bold>🏠 主页</Text>
    </Box>
  );
}

// 把 Home 注册为屏幕：没有声明 parent，所以它是根屏幕
// `Home` 不需要 props，所以模板可以省略（默认为 {}）
registerComponent(Home);
```

`registerComponent` 是模块级函数，可以在 `.ts` 或 `.tsx` 的任意位置调用（通常紧跟组件定义）。

注册之后，用 `ScenarioManagementProvider` 指定默认屏幕并渲染：

```tsx
render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <CurrentScreen />
  </ScenarioManagementProvider>
);
```

运行后终端会显示 `🏠 主页`。其中：

- `component`（第一个参数）：当前屏幕是哪个组件。**组件本身作为注册的唯一标识**，同一个组件只能注册一次。
- `template`（第二个参数，可选）：初始模板，用作屏幕的**默认 props**。导航时传入的 props 会与它合并。`Home` 不需要 props，所以可以省略（默认为 `{}`）。

## 构建一棵分支树

下面注册一棵"主菜单 → 设置 / 关于"的树，演示**一父多子**：

```tsx
import React from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  ScenarioManagementProvider,
  registerComponent,
} from 'ink-cartridge';

function MainMenu() {
  return (
    <Box flexDirection="column">
      <Text bold>🏠 主菜单</Text>
      <Text>设置 / 关于 都是我的子屏幕</Text>
    </Box>
  );
}
registerComponent(MainMenu, {});

function Settings() {
  return <Text>⚙️ 设置</Text>;
}
// parent 指向 MainMenu：Settings 成为 MainMenu 的子屏幕
registerComponent(Settings, {}, { parent: MainMenu });

function About() {
  return <Text>ℹ️ 关于</Text>;
}
// About 同样挂在 MainMenu 下面
registerComponent(About, {}, { parent: MainMenu });

render(
  <ScenarioManagementProvider defaultScreen={MainMenu} fullScreen>
    <CurrentScreen />
  </ScenarioManagementProvider>
);
```

注册完成后，屏幕树长这样：

```
MainMenu（根屏幕）
├── Settings
└── About
```

注意注册顺序：**先注册父屏幕，再注册子屏幕**。如果 `parent` 尚未注册，`registerComponent` 会直接抛错（见下文注意事项第 2 条）。

## API 参考

`registerComponent` 的函数签名：

```typescript
function registerComponent<C extends React.ComponentType<any>>(
  component: C,
  template?: React.ComponentProps<C>,
  options?: RegisterOptions,
): void
```

- `component` {React.ComponentType&lt;any&gt;} 注册为屏幕的 React 组件，同时作为注册的唯一标识。
- `[template]` {React.ComponentProps&lt;C&gt;} 初始模板，即屏幕的默认 props；导航时与传入的 props 合并。 **默认值：** `{}`。
- `[options]` {RegisterOptions}
  - `[parent]` {React.ComponentType&lt;any&gt;} 父屏幕组件；不声明则该屏幕是根屏幕（候选）。

`RegisterOptions` 的完整定义：

```typescript
interface RegisterOptions {
    parent?: ComponentType<any> | undefined;
}
```

## 注意事项

1. **同一个组件只能注册一次。** 重复调用 `registerComponent` 会抛出错误：`[Ink-Cartridge] Component "xxx" is already registered. Duplicate registration is not allowed.`（避免在热更新、循环等场景中重复注册。）
2. **`parent` 必须先注册。** 声明 `parent` 时，该父组件必须已经注册过，否则抛错并提示你先注册父组件：`Register the parent first with registerComponent(...)`。
3. **不声明 `parent` 即根屏幕。** 根屏幕没有父节点，通常作为 `defaultScreen` 传入 `ScenarioManagementProvider`，作为应用的默认页和主页。
4. **可以有多个根屏幕。** 每个没有 `parent` 的组件都是一棵独立树的根，彼此互不影响，各自拥有自己的子树。
5. **`template` 是默认 props，不是"当前值"。** 它只描述屏幕被创建时的默认属性；导航时传入的 props 会与之合并，`template` 本身不会被修改。它是可选的——省略等同于传 `{}`。
