# 停止键传播：`stop()`

`stop()` 在当前层登记一组**拦截键**：这些键到达本层后，即使没有任何绑定命中，也不会继续向更低的层传播。

```typescript
stop(keys: string[], options?: StopOptions): () => void
```

在屏幕组件或图层元素内调用，返回一个移除拦截规则的函数。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 拦截生效的前提是绑定未命中 |
| [普通图层](/zh/screen/layer-base) | `stop` 作用在「当前层」上 |

## 同一层内的求值顺序

| 顺序 | 机制 | 命中后的结果 |
|---|---|---|
| 1 | 绑定 `boundKeyboard` | 处理事件，传播结束 |
| 2 | 穿透 `penetration` | 键被释放，继续传到下层 |
| 3 | 拦截 `stop` | 键在本层被吞掉，不再向下传播 |

`stop` 是兜底机制：只有绑定未命中、且该键没有被穿透时，拦截才生效。两个边界：

- **拦截不影响层内广播。** 同一图层内的激活元素仍会先处理该键（优先级处理器 → 普通绑定），`stop` 只切断向更下层的传播。
- **`stop` 优先于 `penetration`。** 同一个键在同一层既被穿透又被拦截时，拦截胜出——键不会继续传播。

## 基本用法

在屏幕内拦截方向键，栈中更下层的屏幕不会再收到它们：

```tsx
const { stop } = useKeyboard()

useEffect(() => stop(['up', 'down', 'left', 'right']), [stop])
```

通配符 `"*"` 拦截全部按键：

```tsx
useEffect(() => stop(['*']), [stop])
```

## 条件拦截

`when` 接受回调或已注册的命名条件 id，返回 `false` 时该拦截规则被忽略，按键照常传播：

```tsx
useEffect(() => stop(['*'], { when: () => isEditing }), [stop, isEditing])
```

## 用动作 id 登记拦截

`stopAction: true` 把 `keys` 当作快捷键动作 id，在匹配时解析为动作当前绑定的键。之后重新绑定该动作的键位，拦截规则会自动跟随：

```tsx
useEffect(() => stop(['submit', 'cancel'], { stopAction: true }), [stop])
```

## 限定作用范围

```tsx
// 只在该焦点目标激活时拦截
useEffect(() => stop(['escape'], { focusId: 'searchInput' }), [stop])
```

在图层元素内调用 `useKeyboard().stop()` 时，`elementId` 由 Hook 自动注入，无需手写；`focusId` 和 `elementId` 也可以显式传入。

## 返回值与错误

`stop()` 返回取消函数，从 `useEffect` 返回即可完成清理：

```tsx
useEffect(() => stop(['q']), [stop])
```

以下情况会抛错：

| 情况 | 错误 |
|---|---|
| 没有激活的屏幕或图层（无 owner） | `[keyboard-engine] stop() must be called inside a screen component or overlay.` |
| `stopAction: true` 且动作未注册或无绑定键 | 提示该动作未注册或没有绑定键 |

> 模态层默认拦截所有按键，在模态层内通常不需要 `stop`。
