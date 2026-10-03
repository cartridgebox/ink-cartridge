# 学习使用 `boundKeyboard` 方法的中级特性

在之前，我们已经了解到了 `boundKeyboard` 方法的基本特性，例如 `mode` 可以让绑定在特定模式下生效， `times` 可以控制此绑定的按键需要按多少次才可以触发，`once` 表示此按键触发之后即自动销毁，可以配合 `times` 使用。但 `boundKeyboard` 还远不止这些特性，我们将会在本文章讲解到下列特性，而一些特性将在更后面的文章中出现，例如 `ref` 它涉及到鼠标，因此这里不会涉及。
此外 `boundKeyboard` 方法拥有三个重载方式，但我们目前仅涉及到了最基础的重载，由于另外两个涉及到Action快捷操作，我们在本文章中同样不会涉及。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 本章直接从 `mode` / `times` / `once` 往下讲 |

## 特性预估

- `when` {() => boolean | string} 动态启用/禁用此绑定：返回 `true` 时绑定生效，返回 `false` 时绑定失效。
- `observer` {(remaining: number) => void} 必须与 `times` 同时使用。在 `times` 计数归零之前，每次按键都会触发此回调，并传入剩余还需按下的次数。

## 使用 `boundKeyboard` 配合 `when` 与条件系统

在某些场景中，我们需要精确控制一个绑定的生效与失效，例如，我们有时希望在玩家血量低于一半的时候禁用某些绑定，这时候就可以使用 `when` 选项了，同时我们还会涉及到条件系统。

`when` 需赋予一个返回布尔值的函数，同时也允许赋予一个字符串，但我们先讲第一种用法。以上面的场景为例子，我们可以这样写。
```typescript
function Game() {
	const [health, setHealth] = useState(100)
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 我们定义 x 键触发玩家扣血
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// 我们就可以规定，当玩家血量低于或等于一半的时候，就可以按下 b 键返回上一个屏幕，如果没有则不允许退出到上一个屏幕
		const unbindB = boundKeyboard(["b"], () => back(), {
			when: () => health <= 50
		})

		return () => {
			unbindX()
			unbindB()
		}
	}, [boundKeyboard, back, health])
}
```

上面的写法可以工作，但存在一个隐患：`when` 函数是在**按键按下时**才被求值的，它捕获了 effect 闭包中的 `health`。为了让闭包中的 `health` 始终保持最新，我们不得不把 `health` 加入依赖数组——结果是每次血量变化，`b` 键的绑定都会被销毁并重建。当生效条件依赖某个频繁变化的状态时，这种重建显得多余。

当然你可以使用 `useRef` 避免，但略显复杂，在必要的时候才会使用。
```tsx
function Game() {
	const [health, setHealth] = useState(100)
	const healthRef = useRef(health)
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	// 将最新的 health 同步到 ref 中，使 when 始终读到最新值
	useEffect(() => {
		healthRef.current = health
	}, [health])

	useEffect(() => {
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// when 读取 ref，血量变化时无需重建绑定
		const unbindB = boundKeyboard(["b"], () => back(), {
			when: () => healthRef.current <= 50
		})

		return () => {
			unbindX()
			unbindB()
		}
	}, [boundKeyboard, back])
}
```

事实上，`when` 除了函数之外，还允许接收一个**字符串**，字符串对应的是注册在键盘引擎中的"命名条件"——这正是文章开头提到的**条件系统**。使用命名条件，可以把"生效条件"与"绑定"彻底解耦：绑定只注册一次，条件则可以在任意位置随时更新。

### 条件系统：`addCondition` 与 `setCondition`

`useKeyboard` 额外提供了三个与条件相关的方法：

```typescript
const { addCondition, setCondition, removeCondition } = useKeyboard()

addCondition("lowHealth", false)   // 注册命名条件，第二个参数为初始值
setCondition("lowHealth", true)    // 更新条件值，下一次按键立即生效
removeCondition("lowHealth")       // 移除条件
```

- `addCondition(id, defaultVal)` —— 注册命名条件。若该 id 已被注册，返回 `false` 且**不会覆盖**已有条件，因此重复调用是安全的；
- `setCondition(id, value)` —— 更新条件值。条件在每次按键按下时才被求值，因此更新后**下一次按键立即生效**，无需任何同步或刷新；
- `removeCondition(id)` —— 移除条件。若 id 不存在，返回 `false`。

现在把开头的例子改写为使用命名条件：

```typescript
function Game() {
	const [health, setHealth] = useState(100)
	const { back } = useScreenSystem()
	const { boundKeyboard, addCondition, setCondition, removeCondition } = useKeyboard()

	useEffect(() => {
		// 注册命名条件 "lowHealth"，初始为 false（血量充足）
		addCondition("lowHealth", false)

		// x 键负责扣血，始终生效
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// b 键只注册一次，是否生效完全由 "lowHealth" 条件决定
		const unbindB = boundKeyboard(["b"], () => back(), {
			when: "lowHealth"
		})

		return () => {
			unbindX()
			unbindB()
			removeCondition("lowHealth")
		}
	}, [boundKeyboard, back])

	// 血量变化时同步条件，b 键的绑定无需重建
	useEffect(() => {
		setCondition("lowHealth", health <= 50)
	}, [health, setCondition])
}
```

两个版本对比，差异在于条件变化如何传递给引擎：

- 函数写法中，`when` 依赖闭包捕获的状态，条件变化时必须通过依赖数组触发**重建绑定**；
- 命名条件写法中，`b` 键的绑定只注册一次，血量变化通过 `setCondition` 独立地传递给引擎，绑定的注册与解除和条件本身完全无关。

### 函数 `when` 与命名条件如何选择

两者都能实现"条件为真才生效"，区别在于条件的变化如何到达引擎：

| | 函数 `when` | 命名条件（`when: "id"`） |
| :--- | :--- | :--- |
| 绑定注册 | 条件依赖的状态变化时，可能需重建绑定 | 只需注册一次 |
| 条件来源 | 闭包捕获组件局部状态 | 引擎中的独立命名布尔值 |
| 更新方式 | 借助依赖数组与重新渲染 | 任意位置调用 `setCondition` |
| 适用场景 | 条件简单，仅依赖当前组件内部状态 | 条件被多个绑定复用，或需跨组件、跨屏幕共享 |

另外需要说明：`when` 与条件系统并非 `boundKeyboard` 专属，`globalKeys`、`boundSequence`、`penetration`、`stop` 等绑定方法同样支持 `when` 选项。因此可以在整个应用中统一使用命名条件——例如用全局的 `isEditing` 条件同时门控多处的快捷键。

### 注意事项

1. **`when` 使用字符串时，对应的条件必须已注册。** 若引用了未注册的条件，按键时会抛出错误。例如引用了尚未注册的 `"lowHealth"`：
   ```
   [ink-cartridge] Condition "lowHealth" is not registered. Call addCondition("lowHealth", <defaultValue>) before using when: "lowHealth" in a keyboard binding.
   ```
   因此务必先 `addCondition`，再注册绑定。
2. **命名条件不会自动随组件状态更新。** 与函数写法不同，你需要手动在状态变化处调用 `setCondition`；若忘记更新，绑定会停留在旧值。
3. **条件系统与 `mode`（模式）的区别。** 模式是互斥的离散状态，同一时刻只有一个模式生效；而条件是可以同时为真的独立布尔开关，适合表达 `isEditing`、`hasSelection`、`isConnected` 这类状态驱动的门控。

## 使用 `boundKeyboard` 配合 `observer`

`observer` 是 `times` 的好搭档：当用 `times` 要求连按多次时，`observer` 可以在**每一次**按键后收到反馈，从而在界面上实时展示连按进度——例如提示玩家"还差几次"。

它接收一个回调，参数为**剩余还需按下的次数**：

```typescript
observer?: (remaining: number) => void
```

- 与 `times` 同时使用时，**每次按键**都会触发该回调，并传入剩余次数（从 `times - 1` 递减到 `0`）；
- 当传入 `0` 时，意味着本次按键后 handler 即将触发；
- handler 触发后计数器重置，若绑定未被解绑，下一轮连按会重新开始计数，`observer` 也随之再次触发。

延续上面的场景：我们希望玩家连按 3 次 `b` 键才能返回上一个屏幕，同时实时显示还差几次：

```tsx
function Game() {
	const [remaining, setRemaining] = useState(3)
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		return boundKeyboard(["b"], () => back(), {
			times: 3,
			observer: (remaining) => setRemaining(remaining)
		})
	}, [boundKeyboard, back])

	return (
		<Box>
			<Text>连按 3 次 b 键返回上一个屏幕（还需 {remaining} 次）</Text>
		</Box>
	)
}
```

运行效果：第一次按下 `b` 时 `observer(2)` 被调用，界面显示"还需 2 次"；第二次显示"还需 1 次"；第三次按下时 `observer(0)` 被调用，随后 `back()` 触发。

### 注意事项

1. **`observer` 必须与 `times` 同时使用。** 若只设置 `observer` 而未设置 `times`，注册时会抛出错误：
   ```
   [keyboard-engine] boundKeyboard() observer option requires times option to be set.
   ```
2. **`times` 的取值必须大于等于 1。** 若设置 `times: 0` 或负数，注册时会抛出错误：
   ```
   [keyboard-engine] boundKeyboard() times option must be >= 1.
   ```
