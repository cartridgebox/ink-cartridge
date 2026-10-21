# 默认组与命名组

焦点目标被收进组。默认组承接所有未指定组名的目标；命名组让屏幕同时拥有多个互不干扰的激活焦点。每组同一时刻只有一个激活目标，组与组之间可以同时激活。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [焦点系统](/zh/keyboard/focus-system) | 焦点目标、激活与惰性创建 |

## 两种写法

```tsx
// 默认组
boundKeyboard(['up'], move, { focusId: 'nav-item-1' })

// 命名组 form
boundKeyboard(['tab'], nextField, { focusId: { group: 'form', focusId: 'field-1' } })
```

`focusId` 为字符串时进默认组；`{ group, focusId }` 进指定命名组。

## 组内操作

```ts
focusSet('field-2', 'form')       // 组内强制切换
focusNext('form')                 // 组内前进
focusPrev('form')                 // 组内后退
focusCurrent('form')              // 读取组内当前目标
focusUnregister('field-2', 'form')
useFocusState('field-1', 'form')
```

缺省组名时作用于默认组。

## 点亮与熄灭

命名组不会自动点亮，需要显式激活：

```ts
activateFocusGroup('field-1', 'form')
```

- 只对没有激活目标的组生效；组已激活时返回 `false`，不会切换组内焦点。
- 组不存在或 `focusId` 不在组内时返回 `false`。

```ts
kickFocusGroup('form')
```

移除该组的激活目标，组回到未激活状态；没有激活目标或组不存在时返回 `false`。缺省组名时作用于默认组。

## 多组路由

多个组同时激活时，引擎收集每个组当前激活目标上的绑定，按激活顺序依次尝试，命中即停。因此：

- 不同组可以绑定不同的键，同时响应；
- 两个组绑定同一个键时，先激活的组优先；
- 组内仍然只有一个目标参与匹配。

## autoTab

`autoTab` 只在默认组内轮转。命名组需要手动绑定：

```tsx
boundKeyboard('tab', () => focusNext('form'))
```

## 边界

- `focusNext` / `focusPrev` 在组内没有激活目标时什么也不做。
- `activateFocusGroup` 不负责切换已有激活焦点；用 `focusSet`。
- `kickFocusGroup` 清除的是整组的激活状态，不会恢复该组之前的目标。
- 组随所在屏幕的键盘层一起销毁；离开屏幕后不会残留。
- 命名组的焦点路由与默认组共用同一套 `focusId` 匹配规则，绑定归属仍由调用位置决定。
