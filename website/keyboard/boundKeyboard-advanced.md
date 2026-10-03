# Learning the intermediate features of the `boundKeyboard` method

Previously, we covered the basic features of the `boundKeyboard` method: `mode` makes a binding active in a specific mode, `times` controls how many presses are needed to trigger a binding, and `once` destroys the binding automatically after it fires, which can be combined with `times`. But `boundKeyboard` has far more to offer. In this article we will cover the following features; some others will appear in later articles — for example `ref`, which involves the mouse, so it won't be covered here.
Additionally, `boundKeyboard` has three overloads, but we only cover the most basic one. The other two involve Action shortcuts, so they are also out of scope for this article.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | This chapter continues straight on from `mode`, `times` and `once` |

## Feature overview

- `when` {() => boolean | string} Dynamically enable/disable the binding: active when it returns `true`, disabled when it returns `false`.
- `observer` {(remaining: number) => void} Must be used with `times`. Before the `times` count reaches zero, every key press triggers this callback with the number of presses remaining.

## Using `boundKeyboard` with `when` and the condition system

In some scenarios, we need precise control over when a binding is active or inactive. For example, we may want to disable certain bindings while the player's health is below half. That's where the `when` option comes in — and it also brings us to the condition system.

`when` takes a function that returns a boolean, and it also accepts a string. Let's cover the first form first. Using the scenario above, we can write:

```typescript
function Game() {
	const [health, setHealth] = useState(100)
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		// Press x to reduce the player's health
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// When health is at or below half, pressing b returns to the previous screen;
		// otherwise leaving is not allowed
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

The code above works, but has a hidden flaw: the `when` function is evaluated **at the moment the key is pressed**, and it captures `health` from the effect closure. To keep `health` in the closure up to date, we have to put `health` into the dependency array — which means every time health changes, the `b` binding is destroyed and rebuilt. When the activation condition depends on a frequently changing state, this rebuilding feels wasteful.

Of course, you can use `useRef` to avoid this, but it is a bit more complex and only worth it when necessary.

```tsx
function Game() {
	const [health, setHealth] = useState(100)
	const healthRef = useRef(health)
	const { back } = useScreenSystem()
	const { boundKeyboard } = useKeyboard()

	// Keep the latest health in the ref so `when` always reads the up-to-date value
	useEffect(() => {
		healthRef.current = health
	}, [health])

	useEffect(() => {
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// `when` reads the ref, so no rebuild is needed when health changes
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

In fact, besides a function, `when` also accepts a **string** that refers to a "named condition" registered in the keyboard engine — this is the **condition system** mentioned at the start of the article. With named conditions, you can fully decouple the "activation condition" from the "binding": the binding is registered only once, and the condition can be updated anywhere at any time.

### The condition system: `addCondition` and `setCondition`

`useKeyboard` provides three extra methods related to conditions:

```typescript
const { addCondition, setCondition, removeCondition } = useKeyboard()

addCondition("lowHealth", false)   // Register a named condition; the second argument is its initial value
setCondition("lowHealth", true)    // Update the condition value; takes effect on the next key press
removeCondition("lowHealth")       // Remove the condition
```

- `addCondition(id, defaultVal)` — registers a named condition. If the id is already registered, it returns `false` and does **not** overwrite the existing condition, so calling it repeatedly is safe;
- `setCondition(id, value)` — updates a condition's value. Conditions are evaluated on every key press, so the update takes effect on the very next key press — no sync or refresh needed;
- `removeCondition(id)` — removes a condition. Returns `false` if the id does not exist.

Now let's rewrite the earlier example to use a named condition:

```typescript
function Game() {
	const [health, setHealth] = useState(100)
	const { back } = useScreenSystem()
	const { boundKeyboard, addCondition, setCondition, removeCondition } = useKeyboard()

	useEffect(() => {
		// Register the "lowHealth" condition, initially false (health is fine)
		addCondition("lowHealth", false)

		// x always works — it reduces health
		const unbindX = boundKeyboard(["x"], () => {
			setHealth(prev => prev - 1)
		})

		// b is registered only once; whether it works depends entirely on "lowHealth"
		const unbindB = boundKeyboard(["b"], () => back(), {
			when: "lowHealth"
		})

		return () => {
			unbindX()
			unbindB()
			removeCondition("lowHealth")
		}
	}, [boundKeyboard, back])

	// Sync the condition when health changes; the b binding needs no rebuild
	useEffect(() => {
		setCondition("lowHealth", health <= 50)
	}, [health, setCondition])
}
```

The difference between the two versions lies in how condition changes reach the engine:

- With the function form, `when` relies on state captured by the closure; when the condition changes, you must trigger a **binding rebuild** through the dependency array;
- With the named-condition form, the `b` binding is registered only once, and health changes reach the engine independently through `setCondition` — registering and unregistering the binding is completely independent of the condition itself.

### Choosing between function `when` and named conditions

Both achieve "the binding fires only when the condition is true"; the difference is how condition changes reach the engine:

| | Function `when` | Named condition (`when: "id"`) |
| :--- | :--- | :--- |
| Binding registration | May need to rebuild the binding when the state it depends on changes | Only registered once |
| Condition source | State captured by the closure | An independent named boolean in the engine |
| Update method | Via the dependency array and re-rendering | Call `setCondition` from anywhere |
| Use case | Simple conditions that only depend on the current component's local state | Conditions reused by multiple bindings, or shared across components / screens |

It's also worth noting: `when` and the condition system are not exclusive to `boundKeyboard` — `globalKeys`, `boundSequence`, `penetration`, `stop` and other binding methods support the `when` option too. So you can use named conditions consistently across the whole app — for example, a global `isEditing` condition gating several shortcuts at once.

### Caveats

1. **When `when` is a string, the corresponding condition must be registered.** If you reference an unregistered condition, an error is thrown when the key is pressed. For example, referencing an unregistered `"lowHealth"`:
   ```
   [ink-cartridge] Condition "lowHealth" is not registered. Call addCondition("lowHealth", <defaultValue>) before using when: "lowHealth" in a keyboard binding.
   ```
   So always call `addCondition` before registering the binding.
2. **Named conditions do not update automatically with component state.** Unlike the function form, you must call `setCondition` manually where the state changes; if you forget, the binding stays at the old value.
3. **The condition system differs from `mode`.** Modes are mutually exclusive discrete states — only one mode is active at a time. Conditions, on the other hand, are independent boolean toggles that can be `true` at the same time — ideal for state-driven gating such as `isEditing`, `hasSelection`, `isConnected`.

## Using `boundKeyboard` with `observer`

`observer` is the perfect partner for `times`: when `times` requires multiple presses, `observer` gives you feedback on **every** press, so you can show the chaining progress in real time on screen — for example telling the player "N more presses".

It takes a callback whose argument is the **number of remaining presses**:

```typescript
observer?: (remaining: number) => void
```

- When used with `times`, the callback fires on **every key press**, receiving the remaining count (counting down from `times - 1` to `0`);
- When it receives `0`, it means the handler is about to fire after this press;
- After the handler fires, the counter resets; if the binding hasn't been unbound, the next round of presses starts counting again and `observer` fires along with it.

Continuing the scenario above: we want the player to press `b` three times before returning to the previous screen, while showing how many presses remain in real time:

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
			<Text>Press b 3 times to return to the previous screen ({remaining} more)</Text>
		</Box>
	)
}
```

How it runs: the first press of `b` calls `observer(2)` and the screen shows "2 more"; the second shows "1 more"; on the third press `observer(0)` is called and `back()` fires.

### Caveats

1. **`observer` must be used together with `times`.** If you set `observer` without `times`, registration throws:
   ```
   [keyboard-engine] boundKeyboard() observer option requires times option to be set.
   ```
2. **`times` must be at least 1.** Setting `times: 0` or a negative number throws:
   ```
   [keyboard-engine] boundKeyboard() times option must be >= 1.
   ```
