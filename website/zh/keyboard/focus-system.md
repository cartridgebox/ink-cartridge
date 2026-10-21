# 焦点系统

焦点决定同层内多个组件竞争同一个键时由谁响应。每个焦点目标有唯一的 `focusId`，一个焦点组同一时刻只有一个激活目标；按键只尝试当前激活目标上的绑定。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | `focusId` 是绑定选项 |

## 焦点目标

给绑定加上 `focusId`，它就不再属于整层，而是属于该焦点目标：

```tsx
boundKeyboard(['up', 'down'], handleUpDown, { focusId: 'select-a' })
```

- 目标在第一次使用该 `focusId` 注册绑定时惰性创建。
- 同一组内，第一个创建的目标自动激活；之后创建的目标等待显式切换。
- 绑定解绑不会注销目标；目标仍然占据焦点顺序。
- 屏幕离开导航路径时，其键盘层及全部焦点目标一起销毁。

## 控制方法

| 方法 | 签名 | 作用 |
|---|---|---|
| `focusSet` | `(focusId, groupOrOptions?)` | 强制激活指定目标 |
| `focusNext` | `(groupOrOptions?)` | 沿注册顺序前进，末尾回绕 |
| `focusPrev` | `(groupOrOptions?)` | 沿注册顺序后退 |
| `focusCurrent` | `(groupOrOptions?)` | 读取当前目标，不触发渲染 |
| `focusUnregister` | `(focusId, groupOrOptions?)` | 注销目标 |
| `useFocusState` | `(focusId, group?)` | 声明式订阅当前目标是否为该 `focusId` |

`groupOrOptions` 可以是组名字符串，或 `FocusSetOptions`：

```ts
type FocusSetOptions = { group?: string; element?: string }
```

```tsx
const { focusSet, focusNext, focusPrev, focusCurrent, focusUnregister, useFocusState } = useKeyboard()

focusSet('select-b')
focusNext()
focusPrev()
const { result, noFound } = focusCurrent()
focusUnregister('select-b')

const focused = useFocusState('select-b')
```

`focusCurrent` 的返回值：

```ts
{
  result?: { id: string; fromGroup: string | symbol }
  noFound?: boolean   // 组内没有激活目标
  noOwner?: boolean   // 没有页面或图层
  noLayer?: boolean   // 当前所有者没有键盘层
}
```

`focusNext` / `focusPrev` 在没有激活目标时什么也不做；`focusSet` 可以直接激活任意已注册目标。`focusUnregister` 注销当前目标后，焦点移交给组内注册顺序中的第一个剩余目标。

## autoTab

```tsx
<KeyboardProvider autoTab>
```

开启后引擎接管 Tab / Shift+Tab，自动调用 `focusNext` / `focusPrev`。只作用于默认组。需要自定义 Tab 行为时关闭 `autoTab` 手动绑定：

```tsx
boundKeyboard('tab', () => focusNext())
boundKeyboard('shift+tab', () => focusPrev())
```

非 React 宿主可以用 `tabKey` 指定正向键名，反向轮转匹配 `shift+<tabKey>`。

## releaseFocusWhenEmpty

```tsx
<KeyboardProvider releaseFocusWhenEmpty>
```

默认关闭。开启后绑定对焦点目标持有引用，最后一个绑定解绑时移除目标；再次注册同一 `focusId` 会重新创建。焦点交给组内第一个剩余目标，组内为空时清空该组槽位。

## 订阅焦点变化

```ts
const { subscribeFocus } = useKeyboard()

useEffect(() => subscribeFocus(() => {
  setCurrent(focusCurrent().result?.id)
}), [subscribeFocus, focusCurrent])
```

`useFocusState` 是更常用的声明式封装；`subscribeFocus` 适合在组件外或需要读取多个组时使用。

## 边界

- `focusSet` 指向未注册的目标会抛错，并列出该组可用目标。
- `useFocusState` 的值在渲染时读取，组件换成另一个 `focusId` 会立即反映，不必等下一次焦点移动。
- 组件卸载与屏幕离开不同：卸载只解绑，焦点仍留在屏幕上；需要移除时在清理函数里调用 `focusUnregister`。
- 命名组与多组路由见[默认组与命名组](/zh/keyboard/focus-group)。
