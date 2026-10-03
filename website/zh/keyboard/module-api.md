# 脱离 React 调用：模块级键盘 API

键盘操作有两个入口：组件里从 `useKeyboard()` 取出的 **Hook 版**，以及从 `ink-cartridge` 直接 import 的**模块级版**。模块级函数把调用转发到当前挂载的 `KeyboardEngine`，让不需要 React 上下文的操作能在模块作用域里驱动。

```tsx
import { addAction, setMode, addProcessor } from "ink-cartridge";
```

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 理解 owner 归属，才能分清哪些操作需要 owner |
| [绑定方法的归属与所有者栈](/zh/screen/binding-attribution) | `withOwner` 手动操作的就是这套所有者栈 |

## 为什么需要模块级 API

Hook 版从 React context 解析 owner（当前屏幕 / 图层元素），因此只能在组件渲染树内调用。但有一批操作本就没有 owner 概念——注册一个快捷键动作、切换模式、调整处理器权重。把它们硬塞进某个组件的 effect 并不自然，有时甚至做不到（模块顶层的初始化代码没有组件）。

模块级 API 就是为这类操作准备的：应用启动时在模块顶层把所有动作、处理器、模式一次注册完毕，无需挂到任何组件上。

## `getEngine` 与 `withOwner`

`getEngine()` 返回**最近挂载**的引擎实例；没有任何 `KeyboardProvider` 挂载时抛错。引擎在**渲染期**（而非 effect 中）完成注册，所以子组件的 effect 里也能取到它。

`withOwner(owner, fn)` 在 `fn` 执行期间把一个 owner 压入引擎的所有者栈，结束后在 `finally` 中弹出——据此，`getEngine()` 上那些**需要 owner** 的方法也能在模块作用域调用。

```tsx
import { getEngine, withOwner } from "ink-cartridge";

// 不需要 owner：直接跑
getEngine().setMode("normal");

// 需要 owner：手动包一层
withOwner(MyPage, () => getEngine().boundKeyboard(["a"], handler));
```

## 哪些能模块级调用

| | 方法 | 入口 |
|---|---|---|
| owner-independent | 全局键、模式、条件、动作、处理器、组合、映射、鼠标区域 | 模块级函数，或 `useKeyboard()` |
| owner-scoped | `boundKeyboard`、`boundSequence`、`penetration`、`stop`、`allowModal`、`focus*` 系列 | `useKeyboard()`，或用 `withOwner` 包住 `getEngine()` |

owner-scoped 的方法需要从 context 解析图层 / 页面归属，因此**不提供模块级版**。

> 屏幕系统的导航函数同样支持模块级导入：`skip`、`back`、`gotoScreen` 可直接从 `ink-cartridge` import；Hook 形式见[屏幕导航](/zh/screen/navigation)。

## 分类索引

以下函数均从 `ink-cartridge` 直接导入，语义与同名的 `useKeyboard()` 方法一致：

| 类别 | 模块级函数 |
|---|---|
| 全局键 | `globalKeys`、`getGlobalKeys`、`globalSequence`、`getGlobalSequences`、`getGlobalPendingSequence`、`thereGlobalQueueWaiting`、`currentScreenHasSequenceWaiting` |
| 模式 | `getCurrentMode`、`addMode`、`removeMode`、`setMode`、`nextMode`、`prevMode` |
| 命名条件 | `addCondition`、`setCondition`、`removeCondition` |
| 快捷键动作 | `defineShortcutAction`、`addAction`、`hasAction`、`removeAction`、`modifyAction`、`clearShortcutOperations` |
| 序列动作 | `defineSequenceAction`、`addSequenceAction`、`hasSequenceAction`、`removeSequenceAction`、`modifySequenceAction`、`clearSequenceOperations` |
| 处理器 | `addProcessor`、`removeProcessor`、`getProcessors`、`resetProcessors`、`activeProcessor`、`kickProcessor`、`setProcessorWeight` |
| 组合 | `registryCompositionKey`、`removeCompositionKey`、`clearAllCompositionKeys`、`hasPendingComposition`、`getCompositionContext`、`abortComposition`、`updateCompositionKey`、`setValueSchema`、`undoComposition`、`bufferedCompositionCount`、`clearCompositionBuffers`、`subscribeComposition`、`getLastCompositionEvent` |
| 映射键 | `addMapping`、`removeMappingKey`、`removeMapping`、`subscribeMapping`、`getLastMappingEvent` |
| 鼠标区域 | `registerMouseRegion`、`unregisterMouseRegion`、`getHoveredMouseRegion` |
| 其他 | `readLayer`、`subscribeFocus`、`enableWildcardPriority` |

这些操作各自的语义在对应章节展开——本表只是它们的模块级入口清单。

## 用法

在模块顶层（组件之外）注册，启动即生效：

```tsx
import { addAction, addCondition, setMode } from "ink-cartridge";

addCondition("isEditing", false);
addAction({ actionId: "save", action: () => saveDoc(), keys: ["ctrl+s"] });
setMode("normal");
```

也可以在任何 effect 或事件回调里调用，行为与 Hook 版一致：

```tsx
useEffect(() => {
  setMode("normal");
  return () => setMode("insert");
}, []);
```

## 返回值与错误

- 模块级函数的返回值与其 `useKeyboard()` 版本**完全一致**：多数为 `void`，但若干返回 `boolean`（`addMode`、`removeMode`、`setMode`、`addMapping`、`removeMappingKey`、`removeMapping`、`addAction`、`hasAction`、`activeProcessor`、`kickProcessor`、`setProcessorWeight` 等），读取类返回快照（如 `getGlobalKeys`）。
- 没有任何 `KeyboardProvider` 挂载时抛错：

  ```
  [ink-cartridge] No KeyboardEngine is mounted. Render a <KeyboardProvider> before calling getEngine().
  ```

> `clearShortcutOperations` 从 `@cartridge-engine/keyboard-engine` 直接导出时是空操作（键盘状态按实例存放）；`ink-cartridge` 导出的模块级版会转发到已挂载的引擎，二者不要混淆。
