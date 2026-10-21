# 鼠标驱动键盘焦点

鼠标区域可以把点击或悬停转发为焦点切换，让同一个组件同时响应鼠标与键盘。开关是 `clickOnFocus`、`enterOnFocus`、`leaveOffFocus`。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 联动通过 `boundKeyboard` 的 `ref` 与 `focusId` 建立 |
| [焦点系统](/zh/keyboard/focus-system) | 焦点目标与 `useFocusState` |
| [绑定归属与所有者栈](/zh/screen/binding-attribution) | 联动记录在调用方所属的作用域中 |

## 机制

```ts
type RegionFocusEntry = { focusId: string | FocusRef }
type RegionFocusMap = Map<RefObject<DOMElement | null>, RegionFocusEntry>
```

- 表的键是 **ref 对象本身**，不是 `regionId`，也不是元素 ID；同一对象才能查得到。
- 表挂在页面、普通图层和模态层上，随它们跨 `CurrentScreen` 重渲染存活。
- 写表的是 `boundKeyboard` / `boundSequence` 的 `{ ref, focusId }`，查表的是 `useMouseRegion`；两侧必须落在同一作用域，优先级为图层元素 > 模态层元素 > 页面。

## 建立联动

把同一个 ref 同时交给两个 hook：

```tsx
function FocusButton({ focusId }: { focusId: string }) {
  const { boundKeyboard } = useKeyboard()
  const focused = useFocusState(focusId)
  const ref = useMouseRegion({ onClick: () => activate() })

  useEffect(
    () => boundKeyboard(['s'], () => activate(), { ref, focusId }),
    [boundKeyboard, ref, focusId],
  )

  return <Box ref={ref} borderColor={focused ? 'green' : 'gray'}>…</Box>
}
```

- `useMouseRegion` 负责矩形测量、命中和查表。
- `boundKeyboard` 的 `{ ref, focusId }` 负责写表，同时正常注册按键。
- 缺少 `{ ref, focusId }` 时，点击只是普通回调。

ref 必须是对象 ref。callback ref 会被拒绝并退回内部 ref，联动静默失效。多条绑定可以共用一个 ref，内部按引用计数，最后一个解绑时移除条目。

## 执行顺序

| 回调 | 顺序 |
|---|---|
| `onClick` | `clickOnFocus` 转发焦点 → 用户 `onClick` |
| `onEnter` | `enterOnFocus` 转发焦点 → 用户 `onEnter` |
| `onLeave` | 清除焦点（见下）→ 用户 `onLeave` |

焦点在引擎中同步更新；`useFocusState` 的值要到下一次渲染才更新。回调里需要立即读取时用 `focusCurrent()`。

## 选项

| 选项 | 默认值 | 行为 |
|---|---|---|
| `clickOnFocus` | `true` | 点击转发焦点 |
| `enterOnFocus` | `false` | 悬停进入转发焦点 |
| `leaveOffFocus` | `true` | 仅在 `enterOnFocus: true` 时参与：离开时清除焦点 |

`leaveOffFocus` 不会影响只点击的区域，避免用户点完移开鼠标就丢失焦点。

```tsx
useMouseRegion({ onClick: select }, { clickOnFocus: false })
useMouseRegion({ onEnter: hover, onLeave: unhover }, { enterOnFocus: true, leaveOffFocus: false })
```

## 命名组

```ts
boundKeyboard(['s'], activate, {
  ref,
  focusId: { group: 'nav', focusId: 'nav-item-1' },
})
```

| 条目形态 | 进入 / 点击 | 离开 |
|---|---|---|
| 字符串 | 设置默认组焦点 | `kickFocusGroup()` |
| `FocusRef` | 设置指定组焦点 | `kickFocusGroup({ group })` |

离开清除的是**整个组**当前持有的焦点，不只是登记的那个 `focusId`。

## 序列

`boundSequence(keys, actionId, { ref, focusId })` 也会写表。点击切换焦点后，只有持有焦点的区域开始匹配它的序列，同一组按键可以在不同面板上走不同分支。

## 联动失效排查

1. `<KeyboardProvider mouse>` 是否开启。
2. 两个 hook 是否收到同一个 ref 对象。
3. 是否误用了 callback ref。
4. 写表与查表是否在同一作用域（同一组件内即一致）。
