# Switching screens with `skip`, `gotoScreen`, and `back`

We already know how to organize screen structures with `registerComponent`, but to actually switch screens we need to combine it with binding methods, such as `boundKeyboard`.

There are three core navigation methods, all obtained through the `useScreenSystem` hook and usually used together with methods like `boundKeyboard`.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Organize Your Screen](/screen/screen-registry) | Navigation happens on the screen tree, so the parent/child relation comes first |
| [Basic Binding](/keyboard/base-bind) | Navigation methods are driven by keys |

## Using the `skip` method to switch screens

When you need to switch to a direct child of the current screen, you can use the `skip` method. For example, suppose the root screen of your app is Menu, and Game declares its `parent` as Menu — you can then use `skip` to jump to it.
If for some reason you must jump to a screen that is not a direct child, `skip` is not suitable for that scenario. If you force it anyway, `skip` will throw the error **xxx is not a child of xxx. Use skip to navigate down the tree, or gotoScreen to jump across branches.**

Here is the scenario where `skip` applies.
```tsx
// Assume Main is the root screen
registerComponent(Main, {})

// Game is now a direct child of Main
registerComponent(Game, {}, { parent: Main })

```

Therefore, inside the Main component you can directly use `skip` to jump to the Game screen.
```tsx
function Main() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// With this, pressing s while on the Main screen jumps to the Game screen
		return boundKeyboard(["s"], () => skip(Game))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```

In the following scenario you cannot use `skip` to switch screens.
```tsx
// Here, Main is the root screen
registerComponent(Main, {})

// Game is a direct child of Main
registerComponent(Game, {}, { parent: Main })

// Settings is also a direct child of Main, so Settings and Game are siblings rather than a direct parent-child pair
registerComponent(Settings, {}, { parent: Main })
```

Calling `skip` inside the Game component to jump to Settings will throw an error (see the error message above).
```tsx
function Game() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// Error: skip can only jump to a direct child screen, not a sibling screen
		return boundKeyboard(["s"], () => skip(Settings, {}))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```

`skip` also cannot jump to the parent screen.
```tsx
function Game() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// Error: skip can only jump to a direct child screen
		return boundKeyboard(["b"], () => skip(Main, {}))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```

### Using `skip` to pass props

The second argument of `skip` is used to pass props to the target screen. `skip` merges the passed props with the template registered for the screen. It is optional when the target screen declares no required props — omitting it is equivalent to passing `{}`. The snippet below shows how to pass props with `skip`.
```tsx
// Declare a Game component whose props require a playerName
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
If we have a root screen Menu and Game is a direct child of Menu, we can use `skip` and pass props while jumping.
```tsx
function Menu() {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// After pressing s, you enter the Game screen and it shows "default"; pass any other string and that string is shown instead
		return boundKeyboard(["s"], () => skip(Game, { playerName: "default" }))
	}, [boundKeyboard, skip])

	return (
		...
	)
}
```
You can use it to pass any data.

### Using `skip` to refresh the current screen

Sometimes we need to refresh the current screen and update some prop state. `skip` provides a special option that lets you update state inside the screen. You can control this behavior with the `onlyAttribute` option of `skip`. The prerequisite is that the first argument of `skip` must be the screen you are currently on. In general, you use the second argument to pass new props to change state, while the `onlyAttribute` option only controls whether the screen is re-rendered fresh. See the snippet below.

`gotoScreen` takes the same option for a target already on the current path; see [Refreshing a screen that is already on the path](#refreshing-a-screen-that-is-already-on-the-path).

> **Note:** When using `onlyAttribute`, the current screen must also be registered.


```tsx
function Game({ text }: { text: string }) {
	const { skip } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// Press r and you will see the screen show "Game refreshed"
		return boundKeyboard(["r"], () => skip(Game, { text: "Game refreshed" }, { onlyAttribute: true }))
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

## Using the `gotoScreen` method to switch screens

As mentioned earlier, `skip` can only jump to a direct child of the current screen. When you need to jump to a sibling screen or a screen on another branch, `skip` is powerless — that is when you need the `gotoScreen` method.

`gotoScreen` can jump to any registered screen, no matter how it relates to the current screen. For example, Main is the root screen, and Game and Settings are both direct children of Main. From inside Game, using `skip` to jump to Settings throws an error, but `gotoScreen` works fine.

```tsx
// Here, Main is the root screen
registerComponent(Main, {})

// Game is a direct child of Main
registerComponent(Game, {}, { parent: Main })

// Settings is also a direct child of Main — siblings with Game rather than a direct parent-child pair
registerComponent(Settings, {}, { parent: Main })
```

```tsx
function Game() {
	const { gotoScreen } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// Pressing s now jumps from the Game screen to the Settings screen, even though they are siblings
		return boundKeyboard(["s"], () => gotoScreen(Settings, {}))
	}, [boundKeyboard, gotoScreen])

	return (
		...
	)
}
```

`gotoScreen` finds the **lowest common ancestor** of the current screen and the target screen, then rebuilds the path from that ancestor. Therefore, when you press `back` after jumping, you return to that common ancestor rather than back to the screen you jumped from. In the example above, after jumping from Game to Settings, calling `back` returns to the Main screen, not the Game screen.

The second argument of `gotoScreen` works like `skip`'s — it passes props to the target screen, and they are merged with the template registered for the screen. Like `skip`, it is optional when the target screen declares no required props.

::: Note
The target of `gotoScreen` must already be registered, otherwise it throws the error **xxx is not registered. Please call registerComponent() first.**.
:::

### Refreshing a screen that is already on the path

`gotoScreen` also works when the target is already on the current path: the current screen, or one of its ancestors. The params replace that entry's registered template, and the screen is remounted by default. Pass `{ onlyAttribute: true }` to update only its props.

```tsx
// Settings is the current screen
gotoScreen(Settings, { theme: "light" }, { onlyAttribute: true })
```

The mounted instance is kept only when the target is the current screen. An ancestor was unmounted while the deeper page was on top, so it mounts fresh either way; what `onlyAttribute` preserves there is the page's mouse-region focus map. Pages below the target are dropped in both cases, as with any jump to an ancestor.

## Using the `back` method to switch screens

The `back` method returns to the previous level — that is, the parent screen of the current screen. For example, Main is the root screen and Game is a direct child of Main. Calling `back` from inside the Game screen returns to the Main screen.

```tsx
function Game() {
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// While on the Game screen, pressing b returns to the Main screen
		return boundKeyboard(["b"], () => back())
	}, [boundKeyboard, back])

	return (
		...
	)
}
```

`back` accepts a `levels` argument that specifies how many levels to go back; it defaults to 1. If your screens are nested deeply, e.g. Main > Game > Setting, you can call `back(2)` from the Setting screen to return straight to the Main screen, without calling `back()` twice.

```tsx
function Setting() {
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// While on the Setting screen, pressing b returns directly to the Main screen (skipping the Game screen)
		return boundKeyboard(["b"], () => back(2))
	}, [boundKeyboard, back])

	return (
		...
	)
}
```


> **Note:** The `levels` argument of `back` must be >= 1, otherwise it throws the error **back() levels must be >= 1.**. Also, calling `back` on the root screen throws the error **back() failed: already at the root node, cannot go back.**, because the root screen has no parent to return to.


## Best practices

Use `skip` when you need to jump to a direct child screen; use `gotoScreen` when you need to jump across branches or levels — don't overuse `gotoScreen`.
