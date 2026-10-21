# 绑定方法的归属与所有者栈

一条绑定总是挂在某个键盘层上：页面组件、普通图层的某个元素，或模态层的某个元素。这个落点叫归属，由调用位置决定。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 绑定方法的注册方式 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | 图层元素的绑定何时生效 |
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 模态元素的绑定何时生效 |

## 调用位置决定归属

| 调用位置 | 绑定落在 | 生效条件 |
|---|---|---|
| 页面组件 | 该屏幕的键盘层 | 屏幕在导航栈中 |
| 图层元素 | 图层内的该元素 | 图层打开且元素 `active` |
| 模态层元素 | 模态层内的该元素 | 模态层位于最顶 |

```tsx
function Home() {
  const { boundKeyboard } = useKeyboard()

  useEffect(
    // 归属 Home 屏幕
    () => boundKeyboard('a', () => openPanel()),
    [boundKeyboard],
  )
}
```

## 所有者与所有者栈

绑定方法通过 `useKeyboard()` 调用时，会从调用处的上下文推断所有者：

- `LayerElementContext` → 图层 ID；
- `ModalLayerElementContext` → 模态层 ID；
- 页面组件 → 页面组件本身。

引擎把所有者压入栈，解析完归属后弹出。栈为空时按以下顺序回退：

1. 所有者栈栈顶；
2. 最顶的模态层；
3. 最顶的普通图层；
4. 当前页面；
5. 都没有 → 没有所有者。

没有所有者时调用绑定方法会报错：

```
[keyboard-engine] boundKeyboard() must be called inside a screen component or overlay.
```

## elementId

图层可以挂多个元素，因此「图层 ID」不足以定位绑定，还需要 `elementId`。`useKeyboard()` 会从上下文自动注入：

```tsx
boundKeyboard('w', () => step())                       // 自动注入
boundKeyboard('w', () => step(), { elementId: 'body' }) // 手动覆盖
```

自动注入是常态；只有从页面组件向某个图层元素注册、或使用模块级 API 时才需要手动传。

## 边界

- 页面绑定只在页面位于导航栈时有效；离开页面时其键盘层被销毁。
- 图层绑定随图层关闭、元素暂停或页面切换清除图层而失效。
- 模态绑定只在模态层位于最顶时参与分发。
- 不要依赖空栈回退；它只是兜底，正常写法是在正确的组件或元素内调用。
- 绑定注册在 `useEffect` 中并返回解绑函数，避免组件卸载后残留「幽灵按键」。
- 模块级调用可以用 `withOwner(owner, fn)` 临时指定所有者，见[模块级键盘 API](/zh/keyboard/module-api)。
