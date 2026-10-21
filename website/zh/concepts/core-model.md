# 核心概念

ink-cartridge 由三部分组成：屏幕系统、键盘引擎、React 适配层。三者共享同一套归属与状态模型。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [快速开始](/zh/quick-start-1) | 先跑通最小应用 |

## 三部分

| 部分 | 职责 | 入口 |
|---|---|---|
| 屏幕系统 | 屏幕树与栈、导航、图层、模态层、鼠标区域归属 | `registerComponent` / `useScreenSystem` |
| 键盘引擎 | 按键归一化、九阶段流水线、绑定与焦点 | `KeyboardEngine` |
| React 适配层 | 把两者接入 React，维护渲染与状态同步 | `ScenarioManagementProvider` / `KeyboardProvider` |

## 屏幕树与栈

`registerComponent(Component, template, { parent })` 建立屏幕树。当前活跃的是一条从根到叶的路径，栈顶由 `CurrentScreen` 渲染。`skip` 向下、`back` 向上、`gotoScreen` 按最近公共祖先跨分支。

## 图层与模态层

图层独立于屏幕树，浮在当前屏幕之上；模态层再浮于图层之上并接管键盘。两者都按 `zIndex` 堆叠，`zIndex` 同时决定视觉、键盘和鼠标优先级。跨页保留与键盘接管见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover)。

## 键盘流水线

```text
模态 → 覆盖相（组合 / 全局序列 / 全局键）
     → 图层广播
     → 屏幕相（组合 / 全局序列 / 全局键）
     → 屏幕栈
```

首个消费事件的阶段终止传播。图层内部是广播，图层之间是命中即停；模态层在最前面并带屏障。

## 归属

每条绑定挂在调用点所属的键盘层上：页面、图层元素或模态层元素。按键只在该所有者活跃时命中。归属由所有者栈解析，见[绑定归属与所有者栈](/zh/screen/binding-attribution)。

## 焦点

焦点把同一层内的绑定分组到命名目标，一个焦点组同一时刻只有一个激活目标。焦点决定「谁收到键」，绑定归属决定「键挂在哪里」。

## Provider 嵌套

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

`KeyboardProvider` 必须在 `ScenarioManagementProvider` 内层；顺序反了键盘会静默失效。
