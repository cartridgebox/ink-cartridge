# 组织屏幕

屏幕用一棵树组织：每个屏幕最多一个父屏幕，可以有多个子屏幕。`registerComponent` 负责注册，`ScenarioManagementProvider` 与 `CurrentScreen` 负责渲染。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [快速开始](/zh/quick-start-1) | Provider 的完整嵌套方式 |

## registerComponent

```ts
registerComponent(component, template?, options?)
```

- `component` {ComponentType} 屏幕组件，同时作为唯一注册键。
- `[template]` {ComponentProps} 屏幕的默认 props，与导航时的 `params` 合并。**默认值：** `{}`。
- `[options]` {RegisterOptions}
  - `[parent]` {ComponentType} 父屏幕；省略时该屏幕是根屏幕。

```tsx
function Home() {
  return <Text>Home</Text>
}
registerComponent(Home)

function Settings() {
  return <Text>Settings</Text>
}
registerComponent(Settings, {}, { parent: Home })
```

注册后的树：

```
Home
└── Settings
```

`registerComponent` 是模块级函数，通常在组件定义之后立即调用。

## 渲染

`ScenarioManagementProvider` 维护屏幕状态，`CurrentScreen` 渲染当前屏幕：

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

- `defaultScreen` 必须是已注册组件，否则抛错。
- `fullScreen` 让屏幕占满终端高度。
- `KeyboardProvider` 必须嵌在 `ScenarioManagementProvider` 内部；顺序反了键盘会静默失效。

## 边界

- 一个组件只能注册一次；重复注册抛错：`[Ink-Cartridge] Component "xxx" is already registered. Duplicate registration is not allowed.`
- `parent` 必须先注册，否则抛错：`Register the parent first with registerComponent(...)`。
- 不声明 `parent` 的组件都是根屏幕；可以有多个互相独立的树。
- `template` 是默认值，不是当前状态；导航时传入的 `params` 覆盖同名字段，模板本身不变。
- 注册表可以用 `clearRegistry()` 清空，主要供测试隔离使用。
