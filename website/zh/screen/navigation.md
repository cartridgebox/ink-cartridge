# 使用 `skip` , `gotoScreen` , `back` 方法切换页面

我们已经了解到了如何使用 `registerComponent` 组织屏幕结构，但如果我们想要做到真正的屏幕切换则需要配合绑定方法使用，例如 `boundKeyboard`。

导航方法包括三个核心方法，它们都通过 `useScreenSystem` 钩子获取，通常配合 `boundKeyboard` 等方法使用。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [组织屏幕](/zh/screen/screen-registry) | 导航发生在屏幕树上，先要理解父子关系 |
| [基本绑定](/zh/keyboard/base-bind) | 导航方法要靠按键触发 |

## 使用 `skip` 方法切换屏幕

当你需要切换到当前屏幕的直接子屏幕时，你可以使用 `skip` 方法，举个例子，假设你的应用的根屏幕为 Menu ，而 Game 声明了它的 parent 为 Menu ，因此可以使用 `skip` 方法跳转屏幕。
如果你因为某些原因而使你必须跳转到非直接子屏幕，那 `skip` 方法不适用于这种场景，如果你强制这么做的话，`skip` 会报出错误 **xxx is not a child of xxx. Use skip to navigate down the tree, or gotoScreen to jump across branches.**

以下为适用于 `skip` 方法的场景。
```tsx
// 假设 Main 屏幕为根界面
registerComponent(Main, {})

// 此时 Game 屏幕为 Main 屏幕的直接子屏幕
registerComponent(Game, {}, { parent: Main })

```

因此，Main 组件内部可以直接使用 `skip` 方法跳转到 Game 屏幕。
```tsx
function Main() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 这样的话，在 Main 屏幕的时候，按下 s 键则会跳转到 Game 屏幕
		return boundKeyboard(["s"], () => skip(Game))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```

而以下场景中不可以使用 `skip` 方法跳转屏幕。
```tsx
// 此时，Main 为根屏幕
registerComponent(Main, {})

// Game 作为 Main 的直接子屏幕
registerComponent(Game, {}, { parent: Main })

// Settings 也为 Main 的直接子屏幕，这样的话 Settings 与 Game 是兄弟关系而不是直接的父子关系
registerComponent(Settings, {}, { parent: Main })
```

此时在 Game 组件体内直接调用 `skip` 方法跳转到 Settings 时，会直接产生报错（报错信息见上面）。
```tsx
function Game() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 错误，skip 方法只能跳转直接子屏幕，不能跳转兄弟屏幕
		return boundKeyboard(["s"], () => skip(Settings, {}))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```

`skip` 方法也不能跳转到父屏幕。
```tsx
function Game() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 错误，skip 方法只能跳转到直接子屏幕
		return boundKeyboard(["b"], () => skip(Main, {}))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```
### 使用 `skip` 来传递属性

`skip` 的第二个参数用来传递目标屏幕的属性。`skip` 会把传进去的属性与屏幕注册时的模板进行合并。当目标屏幕没有必填 props 时，该参数可以省略——省略等同于传 `{}`。例如下面的片段代码，展示了如何使用 `skip` 方法传递属性。
```tsx
// 声明一个 Game 组件，它的属性需要一个 playerName
function Game({ playerName }: { playerName: string }) {
	...
	return (
		<Box>
			<Text>
				{playerName}
			</Text>
		</Box>
	)
}
```
若我们有一个根屏幕 Menu ，而 Game 屏幕是 Menu 的直接子屏幕，我们就可以使用 `skip` 方法，并在跳转的时候传递属性。
```tsx
function Menu() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 按下 s 键后，即进入了 Game 屏幕，并且 Game 屏幕显示了 "default" 字样，若传递其他任意字符串，那显示的就是那个字符串
		return boundKeyboard(["s"], () => skip(Game, { playerName: "default" }))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```
你可以使用它传递任意数据

### 使用 `skip` 来刷新当前屏幕

有时候，我们需要刷新当前屏幕并且更新一些属性状态，`skip` 提供了一个特殊的参数，让你可以更新屏幕内的状态。你可以使用 `skip` 方法的 `onlyAttribute` 选项来控制这一行为。前提是 `skip` 第一个参数的跳转目标必须为当前所在的屏幕。通常来说，你可以使用第二个参数传递新的属性来改变状态，而 `onlyAttribute` 选项只控制是否重新刷新屏幕。例如下例代码片段。

`gotoScreen` 对已在当前路径上的目标也接受同样的选项，见[刷新已在路径上的屏幕](#刷新已在路径上的屏幕)。

> **Note:** `skip` 在使用 `onlyAttribute` 的时候当前屏幕也必须为已注册的。


```tsx
function Game({ text }: { text: string }) {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 此时按下 r 键即可看见屏幕上显示了 "游戏已刷新 "
		return boundKeyboard(["r"], () => skip(Game, { text: "游戏已刷新" }, { onlyAttribute: true }))
	}, [boundKeyboard, skip])

	return (
		<Box>
			<Text>
				{text}
			</Text>
		</Box>
	)
}
```

## 使用 `gotoScreen` 方法切换屏幕

前面提到过，`skip` 方法只能跳转到当前屏幕的直接子屏幕，当你需要跳转到兄弟屏幕或者其他分支上的屏幕时，`skip` 就无能为力了，这时候你需要使用 `gotoScreen` 方法。

`gotoScreen` 方法可以跳转到任意已注册的屏幕，无论它与当前屏幕是什么关系。举个例子，Main 为根屏幕，Game 与 Settings 都是 Main 的直接子屏幕，此时在 Game 屏幕内使用 `skip` 跳转 Settings 会报错，但使用 `gotoScreen` 却可以正常跳转。

```tsx
// 此时，Main 为根屏幕
registerComponent(Main, {})

// Game 作为 Main 的直接子屏幕
registerComponent(Game, {}, { parent: Main })

// Settings 也为 Main 的直接子屏幕，与 Game 是兄弟关系而不是直接的父子关系
registerComponent(Settings, {}, { parent: Main })
```

```tsx
function Game() {
	const { gotoScreen } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 此时按下 s 键即可从 Game 屏幕跳转到 Settings 屏幕，即使它们是兄弟关系
		return boundKeyboard(["s"], () => gotoScreen(Settings, {}))
	}, [boundKeyboard, gotoScreen])

	return (
		...
	)
}
```

`gotoScreen` 会寻找到当前屏幕与目标屏幕的**最近公共祖先**，然后从这个祖先重新构建路径。因此跳转之后使用 `back` 返回时，你会回到这个公共祖先，而不是回退到跳转前的屏幕。还是上面的例子，从 Game 跳转到 Settings 后调用 `back`，会回到 Main 屏幕，而不是 Game 屏幕。

`gotoScreen` 的第二个参数与 `skip` 一样，用来向目标屏幕传递属性，它同样会与屏幕注册时的模板进行合并。与 `skip` 一样，当目标屏幕没有必填 props 时，该参数也可以省略。

::: Note
`gotoScreen` 的跳转目标必须已经注册过，否则会报出错误 **xxx is not registered. Please call registerComponent() first.**。
:::

### 刷新已在路径上的屏幕

当目标已经在当前路径上时，`gotoScreen` 同样可用：目标可以是当前屏幕，也可以是它的某个祖先。参数会替换该条目已注册的模板，屏幕默认重新挂载。传入 `{ onlyAttribute: true }` 则只更新 props。

```tsx
// Settings 是当前屏幕
gotoScreen(Settings, { theme: "light" }, { onlyAttribute: true })
```

只有目标是当前屏幕时，已挂载的实例才会保留。祖先在更深页面位于顶部时已经被卸载，所以两种情况都会重新挂载；`onlyAttribute` 在祖先上保留的是该页面的鼠标区域焦点映射。两种情况都会丢弃目标以下的页面，这与跳转到祖先的规则一致。

## 使用 `back` 方法切换屏幕

`back` 方法用来返回上一级屏幕，也就是返回到当前屏幕的父屏幕。举个例子，Main 为根屏幕，Game 为 Main 的直接子屏幕，当你在 Game 屏幕内调用 `back` 时，就会回到 Main 屏幕。

```tsx
function Game() {
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 在 Game 屏幕的时候，按下 b 键则会返回到 Main 屏幕
		return boundKeyboard(["b"], () => back())
	}, [boundKeyboard, back])

	return (
		...
	)
}
```

`back` 方法支持一个 `levels` 参数，用来指定返回的层数，默认是 1。如果你的屏幕嵌套层级比较深，比如 Main > Game > Setting，你可以在 Setting 屏幕内使用 `back(2)` 直接返回到 Main 屏幕，而不需要连续调用两次 `back()`。

```tsx
function Setting() {
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// 在 Setting 屏幕的时候，按下 b 键则会直接返回到 Main 屏幕（跳过 Game 屏幕）
		return boundKeyboard(["b"], () => back(2))
	}, [boundKeyboard, back])

	return (
		...
	)
}
```

> **Note:** `back` 的 `levels` 参数必须大于等于 1，否则会报出错误 **back() levels must be >= 1.**。此外，当你在根屏幕调用 `back` 时，会报出错误 **back() failed: already at the root node, cannot go back.**，因为根屏幕已经没有父屏幕可以返回了。


## 最佳实践

当你需要跳转到直接子屏幕的时候使用 `skip` 方法，当你需要跨分支跨层级跳转的时候使用 `gotoScreen` ，而不是滥用 `gotoScreen` 。
