# 中级绑定

`boundKeyboard` 的进阶选项集中在三件事：条件门控（`when`）、连按计数（`times` / `observer`），以及图层出现时休眠（`stopsWorkingAfterLayerAppearing`）。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | `mode` / `once` / `times` 的基础用法 |

## 条件：when

```ts
when: (() => boolean) | string
```

函数在**按键按下时**求值，因此它读取的是闭包里的当前值。依赖频繁变化的状态时，把状态同步到 `useRef` 可以避免反复重建绑定：

```tsx
const healthRef = useRef(health)
useEffect(() => { healthRef.current = health }, [health])

useEffect(
  () => boundKeyboard('b', () => back(), { when: () => healthRef.current <= 50 }),
  [boundKeyboard, back],
)
```

字符串形式引用命名条件，绑定只注册一次：

```ts
const { addCondition, setCondition, removeCondition } = useKeyboard()

addCondition('lowHealth', false)   // 返回 false 表示已存在，不覆盖
setCondition('lowHealth', true)    // 下一次按键生效
removeCondition('lowHealth')
```

| | 函数 `when` | 命名条件 |
|---|---|---|
| 条件来源 | 闭包捕获的状态 | 引擎中的命名布尔值 |
| 更新方式 | 依赖数组触发重建 | 任意位置调用 `setCondition` |
| 适用场景 | 组件内部简单条件 | 多个绑定共享、跨组件或跨屏幕 |

命名条件与 `mode` 不同：同一个时刻可以有多个条件为真，而模式是互斥的。

## 连按：times 与 observer

```ts
boundKeyboard('x', () => confirm(), {
  times: 3,
  observer: (remaining) => setHint(`${remaining} more`),
})
```

- `times` 必须 ≥ 1，累计到 N 次触发，之后重新计数。
- `observer` 必须与 `times` 同时使用；每次按键收到剩余次数，降序到 `0`，此时本次按键后触发 handler。

```tsx
useEffect(
  () => boundKeyboard('b', () => back(), {
    times: 3,
    observer: (remaining) => setRemaining(remaining),
  }),
  [boundKeyboard, back],
)
```

## 图层出现时休眠

```ts
boundKeyboard('x', () => act(), { stopsWorkingAfterLayerAppearing: true })
```

任意普通图层或模态层打开期间，页面级绑定被跳过；全部关闭后恢复。只对页面绑定生效——图层元素本身的绑定已经随图层生命周期失效。带 `focusId` 的页面绑定也遵循同一规则。

## 错误

| 情况 | 错误 |
|---|---|
| `observer` 没有 `times` | `[keyboard-engine] boundKeyboard() observer option requires times option to be set.` |
| `times < 1` | `[keyboard-engine] boundKeyboard() times option must be >= 1.` |
| `when` 引用了未注册的条件 | `[ink-cartridge] Condition "<id>" is not registered. Call addCondition("<id>", <defaultValue>) ...` |
