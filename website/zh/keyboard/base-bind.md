# 基本绑定

`boundKeyboard` 把一组键绑定到回调，并把绑定归属到调用点所在的键盘层。它是键盘系统最基础的入口；动作、序列、焦点、全局键都建立在同一套归属与流水线之上。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [快速开始](/zh/quick-start-1) | Provider 的嵌套顺序 |

## 签名

```ts
boundKeyboard(keys: string | string[], handler: KeyHandler, options?: BoundKeyboardOptions): () => void
```

- `keys` {string | string[]} 归一化键名，例如 `'s'`、`'ctrl+q'`、`['1', '2', '3']`。
- `handler` {() => void} 触发时执行的回调。
- `options` {BoundKeyboardOptions} 见下文。
- 返回：解绑函数。

另有两种以动作 id 为目标的重载，见[快捷键与动作](/zh/keyboard/shortcuts-actions)。

```tsx
function Menu() {
  const { boundKeyboard } = useKeyboard()
  const [selected, setSelected] = useState(1)

  useEffect(() => {
    const un1 = boundKeyboard('1', () => setSelected(1))
    const un2 = boundKeyboard('2', () => setSelected(2))
    return () => { un1(); un2() }
  }, [boundKeyboard])

  return <Text>selected: {selected}</Text>
}
```

Provider 必须按下面的顺序嵌套；`KeyboardProvider` 在外层或缺失时键盘静默失效：

```tsx
<ScenarioManagementProvider defaultScreen={Menu} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

## 选项

| 选项 | 类型 | 作用 | 默认值 |
|---|---|---|---|
| `mode` | `string` | 只在当前模式匹配时生效 | 所有模式 |
| `once` | `boolean` | 首次触发后自动解绑 | `false` |
| `times` | `number` | 累计按满 N 次后触发，可循环 | — |
| `observer` | `(remaining) => void` | 配合 `times`，每次按键报告剩余次数 | — |
| `when` | `() => boolean \| string` | 条件函数或命名条件 ID | — |
| `focusId` | `string \| FocusRef` | 绑定到焦点目标 | — |
| `elementId` | `string` | 绑定到指定图层元素 | 自动注入 |
| `stopsWorkingAfterLayerAppearing` | `boolean` | 任意图层或模态层打开时休眠 | `false` |
| `ref` | `RefObject` | 与鼠标区域共享焦点，见[鼠标与键盘焦点联动](/zh/mouse/mouse-focus) | — |

```tsx
boundKeyboard('s', () => save(), { mode: 'insert' })
boundKeyboard('*', () => start(), { once: true })
boundKeyboard('x', () => confirm(), { times: 3 })
```

`when` 使用字符串时，条件必须先用 `addCondition` 注册，详见[中级绑定](/zh/keyboard/boundKeyboard-advanced)。

## 解绑与清理

把解绑函数从 `useEffect` 返回，组件卸载或依赖变化时自动清理：

```tsx
useEffect(() => boundKeyboard('s', () => save()), [boundKeyboard])
```

回调依赖组件状态时，把该状态加入依赖数组；`boundKeyboard` 的引用是稳定的。

## 事件传播

绑定位于流水线的屏幕栈阶段。事件先经过模态层、全局键、图层等阶段，未被消费时才进入屏幕栈，从当前屏幕向根屏幕逐个尝试；某个屏幕命中后立即停止。

当前屏幕未处理的键默认会继续传给栈中更低的屏幕。前提是更下层屏幕的绑定仍然存在——忘记返回解绑函数会在离开屏幕后留下「幽灵按键」。

## 通配符优先级

默认情况下精确键先于 `'*'` 匹配。需要让 `'*'` 优先（例如文本输入框捕获所有可打印字符）时，调用 `enableWildcardPriority()`：

```ts
const { enableWildcardPriority } = useKeyboard()

useEffect(() => enableWildcardPriority(), [enableWildcardPriority])
```

它使用引用计数，返回的停用函数被调用且计数归零后才恢复默认顺序。

## 边界

- 只在 `KeyboardProvider` 内可用；通过 `useKeyboard()` 解析归属。
- 必须在 `useEffect`（或事件回调）中注册，不要在渲染期间调用。
- `boundKeyboard` 的归属由调用位置决定，见[绑定归属与所有者栈](/zh/screen/binding-attribution)。
- 焦点目标只在激活时参与匹配；`focusId` 会隐式创建焦点目标。
- 键名必须在归化后的形式下书写，见[键名规范](/zh/keyboard/key-names)。
