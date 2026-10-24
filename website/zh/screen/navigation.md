# 屏幕导航

三个导航方法都从 `useScreenSystem()` 获取，也可以直接从 `ink-cartridge` 导入：

| 方法 | 方向 | 目标 |
|---|---|---|
| `skip` | 向下 | 当前屏幕的直接子屏幕 |
| `back` | 向上 | 父屏幕，可一次退多层 |
| `gotoScreen` | 任意方向 | 任意已注册屏幕，按最近公共祖先重建路径 |

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [组织屏幕](/zh/screen/screen-registry) | 导航发生在屏幕树上 |
| [基本绑定](/zh/keyboard/base-bind) | 导航通常由按键触发 |

## 选择哪个方法

| 目标 | 调用 |
|---|---|
| 去直接子屏幕 | `skip(Child, params?)` |
| 刷新当前屏幕 | `skip(Current, params?, { onlyAttribute: true })` |
| 返回父屏幕 | `back()` |
| 一次退多层 | `back(n)` |
| 去兄弟屏幕或其他分支 | `gotoScreen(Target, params?)` |
| 更新祖先屏幕的 props | `gotoScreen(Ancestor, params?, { onlyAttribute: true })` |

`onlyAttribute` 只在目标已在当前路径上时有意义，否则会被忽略。

## skip

```ts
skip(component, params?, options?)
```

- 目标必须是当前屏幕的直接子屏幕。否则 reducer 会忽略该动作：开发环境打印 `"<X>" is not a child of "<Y>". Use skip to navigate down the tree, or gotoScreen to jump across branches.`，生产环境静默，路径保持不变。未注册的目标才会在调用点抛错。
- `params` 与目标注册时的模板合并：`{ ...template, ...params }`。目标没有必填 props 时可以省略。
- `options.onlyAttribute` 见下文「原地刷新」。

```tsx
const { skip } = useScreenSystem()
const { boundKeyboard } = useKeyboard()

useEffect(() => boundKeyboard('s', () => skip(Game, { level: 1 })), [boundKeyboard, skip])
```

`skip(Current, params)`（`Current` 指当前屏幕已注册的组件）刷新当前屏幕：默认替换栈顶条目并重新挂载，路径深度不变，`back` 仍返回真正的父屏幕。

## back

```ts
back(levels = 1)
```

- `levels` 必须是大于等于 1 的整数；否则调用点抛错：`[ink-cartridge] back() levels must be an integer >= 1.`
- 在根屏幕调用，或请求的层数超过当前路径深度：开发环境打印 `back() failed: already at the root node, cannot go back.`（或深度信息）并忽略该动作；生产环境保持路径不变。

```tsx
back()    // 返回父屏幕
back(2)   // 一次退两层
```

## gotoScreen

```ts
gotoScreen(component, params?, options?)
```

`gotoScreen` 可以跳到任意已注册屏幕。它先找到当前屏幕与目标屏幕的最近公共祖先，再重建路径；因此跳转后 `back` 回到公共祖先，而不是跳转前的屏幕。

```tsx
const { gotoScreen } = useScreenSystem()

gotoScreen(Settings, { theme: 'light' })
```

- 目标未注册时抛错：`"<X>" is not registered. Please call registerComponent() first.`
- `params` 的合并规则与 `skip` 相同。
- 目标是当前屏幕或其祖先时，参数替换该条目的模板；页面默认重新挂载。页面以下的条目被丢弃，与跳转到祖先的规则一致。

## 原地刷新：onlyAttribute

```ts
skip(Current, params, { onlyAttribute: true })
gotoScreen(Current, params, { onlyAttribute: true })
```

- 仅当目标已在当前路径上时有效，否则被静默忽略。
- `false`（默认）：用新参数重新挂载目标，内部状态重置。
- `true`：只更新 props。目标是当前屏幕时保留已挂载实例，内部状态和鼠标区域焦点映射都保留。
- 祖先前此时本来就没有挂载，两种取值都会重新挂载；`onlyAttribute` 在祖先上保留的是该页面的 `regionFocus` 映射。
- 无论是否 `onlyAttribute`，非 `crossPage` 图层都会被过滤。

## 边界

- `skip` 不能跳兄弟屏幕、祖先屏幕或未注册屏幕。
- `gotoScreen` 会丢弃目标以下的路径；需要保留内部状态时用 `onlyAttribute` 刷新当前屏幕。
- `params` 只与注册模板合并，不会修改模板本身。
- 页面切换默认关闭 `crossPage: false` 的普通图层和模态层，见[跨页图层与键盘接管](/zh/screen/layer-cross-page-takeover)。
- 模块级导入与 hook 版本行为一致；未挂载 Provider 时调用会抛错。
