# 核心概念

一页地图:ink-cartridge 由三部分组成——屏幕系统、键盘引擎、React 适配层。先建立整体印象，后续章节会轻松很多。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [快速开始](/zh/quick-start-1) | 先跑起来，再看结构 |

## 三部分

| 部分 | 职责 | 入口 |
|---|---|---|
| 屏幕系统 | 屏幕树与栈、图层、模态层、导航 | `registerComponent` / `useScreenSystem` |
| 键盘引擎 | 从按键到绑定命中的全过程（九阶段管线） | `KeyboardEngine` |
| React 适配层 | 把两者接入 React | `ScenarioManagementProvider` / `KeyboardProvider` |

## 屏幕树与栈

`registerComponent(Component, template, { parent })` 建立屏幕树；当前活跃的是一条从根到叶的栈，栈顶即 `CurrentScreen` 渲染的屏幕。`skip` / `back` / `gotoScreen` 在其上导航。详见[组织屏幕](/zh/screen/screen-registry)与[屏幕导航](/zh/screen/navigation)。

## 图层与模态层

图层浮在屏幕之上；模态层再浮于图层之上，且默认独占键盘。二者都经 `useScreenSystem` 打开 / 关闭。详见[普通图层](/zh/screen/layer-base)与[模态层基础](/zh/screen/modal-layer-base)。

## 键盘管线

一个按键从设备到命中绑定，要经过九阶段管线：

模态 → 覆盖相（组合 / 全局序列 / 全局键） → 图层广播 → 屏幕相（组合 / 全局序列 / 全局键） → 屏幕栈

首个消费事件的阶段终止传播。详见[自定义处理器](/zh/keyboard/processors)。

## 归属

每次绑定都携带一个 owner（当前屏幕或图层元素）；按键只在该 owner 活跃时命中。详见[绑定方法的归属与所有者栈](/zh/screen/binding-attribution)。

## Provider 嵌套

`KeyboardProvider` 必须在 `ScenarioManagementProvider` 内层。顺序反了，键盘会**静默失效**。
