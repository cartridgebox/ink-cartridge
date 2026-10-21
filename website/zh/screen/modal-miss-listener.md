# 监听模态层的丢失键

`useModalMissListener` 在模态层内注册回调，当某个键没有被该模态层处理时收到通知。它只观察事件，不改变事件流向：丢失键仍被屏障吞掉。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [模态层键盘事件](/zh/screen/modal-layer-keyboard) | 丢失键就是被屏障吞掉的键 |

## 签名

```ts
useModalMissListener(cb: ModalMissCallback, options?: ModalMissOptions): () => void
```

回调接收 `ModalMissEvent`：

| 字段 | 含义 |
|---|---|
| `miss: false` | 键被模态层处理了 |
| `miss: true` | 键未被处理；同时携带 `key`、`input`、`eventNames` |

选项：

- `[monitorWhen]` {boolean} 命中 `when` 为 `false` 的绑定也算丢失。**默认值：** `false`。
- `[monitorFocusMismatch]` {boolean} 命中非激活焦点目标的绑定也算丢失。**默认值：** `false`。
- `[elementId]` {string} 监听归属的元素；在模态层元素内自动注入。

```tsx
const { useModalMissListener } = useKeyboard()

useEffect(
  () => useModalMissListener((evt) => {
    if (evt.miss) setHint(`未绑定: ${evt.eventNames.join(' / ')}`)
  }),
  [useModalMissListener],
)
```

## 边界

- 必须在模态层内调用；在普通图层中不会生效，在模态层外返回空操作。
- 只通知，不放行；需要让键穿过屏障时用 [`allowModal`](/zh/screen/allow-modal)。
- 监听在组件卸载或返回的解绑函数被调用时清理。
