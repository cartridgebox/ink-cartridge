# 在非 React 环境使用引擎

核心键盘逻辑在框架无关的 `KeyboardEngine` 类中；`KeyboardProvider` 只是它的 React 适配层。Vue、Svelte 或纯 Node 程序可直接持有引擎实例。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 引擎承担的正是绑定、全局键等机制 |
| [模块级键盘 API](/zh/keyboard/module-api) | 模块级函数操作的是同一个引擎实例 |

## KeyboardEngine

- 从 `ink-cartridge`（或 `@cartridge-engine/keyboard-engine`）具名导入。
- `new KeyboardEngine(props: EngineProps)` 构造，`props` 见下。

## EngineProps

- `normalizeKeyNames` {Function} **必填**。把按键信息归一化为键名数组，见[键名规范](/zh/keyboard/key-names)。
- `isNormalChar` {Function} **必填**。判断按键是否为普通字符。
- `modes` {string[]} 初始注册的模式。 **默认值：** `[]`。
- `defaultMode` {string} 初始模式。 **默认值：** 无模式。
- `processors` {KeyboardProcessorProps[]} 构造期注入管线的处理器。
- `defaultTimeout` {number} 组合链超时（毫秒）。 **默认值：** `400`。
- `valueSchema` {ValueSchema} 组合值的类型校验。
- `autoTab` {boolean} 引擎是否接管 Tab / Shift+Tab。 **默认值：** `false`。
- `tabKey` {string} 焦点轮转使用的键名。 **默认值：** `"tab"`。

## 驱动引擎

- `sync(state)` 把屏幕 / 图层状态推入引擎。每次渲染或状态更新后、`processKey` 之前调用；`state` 为 `{ pagePath, layers, modalLayers }`，图层按 `zIndex` 升序。
- `processKey(input, key)` 处理一次按键。
  - 返回：{boolean} 事件被某处理器消费返回 `true`，否则 `false`。
- `pushOwner(owner)` / `popOwner(owner)` 手动维护 owner 栈，供带归属的绑定（`boundKeyboard` / `boundSequence` / `stop` / `penetration` / `allowModal`）使用。
- `boundKeyboard` / `globalKeys` / `addMapping` 等方法与 React 版同名同义。

```ts
import { KeyboardEngine, normalizeKeyNames, isInkSpecialKey } from "ink-cartridge";

const engine = new KeyboardEngine({
  modes: ["normal", "insert"],
  defaultMode: "normal",
  normalizeKeyNames,
  isNormalChar: (key) => !isInkSpecialKey(key),
});

engine.sync({ pagePath: [MyScreen], layers: [], modalLayers: [] });
engine.boundKeyboard(["ctrl+s"], () => save());

// 在按键回调里
engine.processKey(input, key);   // true 表示已消费
```

## 在 React 中注入既有引擎

`KeyboardProvider` 的 `engine` prop 可传入预建实例；此时 `modes` / `defaultMode` / `processors` / `valueSchema` / `autoTab` 这些 prop 会被忽略（`mouse` 仍独立生效）。

```tsx
const engine = useMemo(
  () => new KeyboardEngine({ normalizeKeyNames, isNormalChar }),
  [],
)

<KeyboardProvider engine={engine}>…</KeyboardProvider>
```
