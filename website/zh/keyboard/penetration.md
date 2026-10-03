# 键的穿透：`penetration()`

`penetration()` 在当前层把一组键标记为**透明**：这些键到达本层时，本层的绑定直接被跳过，键继续传给更低的层。

穿透是**放行**，不是拦截——键只是被释放，不会被消费。

```typescript
penetration(keys: string[], options?: PenetrationOptions): () => void
```

在屏幕组件或图层元素内调用，返回一个撤销穿透标记的函数。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [普通图层](/zh/screen/layer-base) | `penetration` 作用在「当前层」上 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 穿透改变的就是本章讲的层间传播 |

## 注册位置决定放行范围

| 注册位置 | 效果 |
|---|---|
| 屏幕组件内 | 本屏幕的绑定跳过该键，键继续交给栈中更下层的屏幕 |
| 图层元素内 | 该键对**整个图层**透明：层内所有元素都收不到它，键继续落到更下层图层，最后才到屏幕 |

第二行容易踩坑：穿透规则是**按层生效**的。同一个图层内只要有任意一个激活元素把某个键标记为透明，该图层内其他元素也一并失去这个键。

## 基本用法

屏幕内放行方向键，让栈中更下层的屏幕接手：

```tsx
const { penetration } = useKeyboard()

useEffect(() => penetration(['up', 'down', 'left', 'right']), [penetration])
```

通配符 `"*"` 放行所有按键——整层不再拦截任何键：

```tsx
useEffect(() => penetration(['*']), [penetration])
```

## 条件穿透

`when` 接受回调或已注册的命名条件 id，返回 `false` 时穿透标记被忽略，键照常由本层处理：

```tsx
useEffect(() => penetration(['tab'], { when: () => !isEditing }), [penetration])
```

## 限定作用范围

```tsx
// 仅当该焦点目标处于激活状态时才放行
useEffect(() => penetration(['escape'], { focusId: 'searchInput' }), [penetration])
```

在图层元素内调用 `useKeyboard().penetration()` 时，`elementId` 由 Hook 自动注入，无需手写。

## 与 `stop` 的关系

同一层内的求值顺序是 **绑定 → 穿透 → 拦截**，穿透会先于绑定把键摘出去。但**拦截优先于穿透**：同一个键在同一层既被穿透又被拦截时，`stop` 胜出，键不会继续传播。[停止键传播](/zh/keyboard/stop)

## Options

- `focusId` {string | FocusRef} 只在该焦点目标激活时放行；`FocusRef` 为 `{ group, focusId }`。
- `when` {(() => boolean) | string} 条件守卫，回调或已注册的命名条件 id。
- `elementId` {string} 规则作用于哪个元素；图层元素内由 Hook 自动注入。

## 返回值与错误

`penetration()` 返回撤销函数，从 `useEffect` 返回即可完成清理：

```tsx
useEffect(() => penetration(['q']), [penetration])
```

没有激活的屏幕或图层（无 owner）时抛错：

```
[keyboard-engine] penetration() must be called inside a screen component or overlay.
```

> 模态层拦截的放行是另一套机制，见 [allowModal 放行键盘事件](/zh/screen/allow-modal)。
