# allowModal 放行键盘事件

`allowModal` 为模态层声明例外：指定的键在该模态层没有处理时，可以穿过键盘屏障，继续落到下层的普通图层或屏幕。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 放行的是模态层屏障 |

## 签名

```ts
allowModal(keys: string[], options?: AllowModalOptions): () => void
```

- `keys` {string[]} 要放行的按键名。
- `options` {AllowModalOptions}
  - `[elementId]` {string} 规则归属的元素；在模态层元素内调用时自动注入。
  - `[focusId]` {string | FocusRef} 只在指定焦点目标内放行。字符串指默认焦点组；`{ group, focusId }` 指命名组。
  - `[when]` {(() => boolean) | string} 条件函数或已注册条件 ID；为 `false` 时放行失效。
- 返回：解绑函数。

```tsx
const { allowModal } = useKeyboard()

useEffect(() => allowModal(['tab']), [allowModal])
```

## 语义

一个键穿过屏障需要同时满足两个条件：

1. 模态层没有处理这个键；
2. 它在放行名单里，且 `when` 条件成立。

模态层自己的绑定优先。即使键在名单里，只要被模态层内的元素处理，就不会穿过去。

## 边界

- 只在模态层组件内生效；在页面或普通图层中调用是无操作，开发环境告警。
- 放行不跳过模态层：键仍然先经过模态层的广播。
- 放行规则随返回的解绑函数移除；通常从 `useEffect` 返回它。
- 与 [`useModalMissListener`](/zh/screen/modal-miss-listener) 不同，放行会改变事件的最终去向，监听只做通知。
