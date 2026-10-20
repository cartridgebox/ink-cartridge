# 学习如何使用焦点系统配合 `boundKeyboard` 的 `focusId`

在真实的应用当中，一个屏幕可能有多个选择栏，表格，输入框等多个组件，它们都会抢占键盘事件，最终造成混乱的场景。例如我们有一个选择栏A和选择栏B，它们都需要上箭头和下箭头控制当前的选择向，此时我们按下下箭头，就会发现，两个选择栏都会响应并下移，这在复杂场景中会造成混乱，并让使用者的体验变得糟糕，看看下面的例子。

假设我们拥有一个这样的组件，它内部绑定了上箭头和下箭头用于控制这个组件。但是问题来了，假设有一个屏幕需要两个这样的组件，但是这样一来两边的绑定就会冲突，造成混乱，因此ink-cartridge提供了一个完整的焦点系统解决这一问题。即**当多个组件或者绑定同时存在且互相冲突时，按键事件到底该路由给谁**
```tsx
function SelectInput(/**...*/) {
	const { boundKeyboard } = useKeyboard()

	useEffect(() => {
		const unBindDown = boundKeyboard(["down"], () => {/**...*/})
		const unBindUp = boundKeyboard(["up"], () => {/**...*/})

		return () => {
			unBindDown()
			unBindUp()
		}
	}, [boundKeyboard])
	
	return (
		/**...*/
	)
}
```

在本章，我们将会学习键盘引擎的焦点系统，并学习一些基本的控制焦点的方法与引擎的自动焦点轮转机制，并学习使用 `boundKeyboard` 方法的 `focusId` 选项，并了解焦点在什么时候会被创建，又在什么时候会被注销。

此外，ink-cartridge支持多焦点特性，默认组与命名组，若不指定任何一个组，则默认在默认组内进行焦点操作。本文章中，不涉及多焦点操作，将会在后续文章详细讲解。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 焦点系统解决的是多条绑定抢同一个键的问题 |

## 基础焦点方法预览

| 方法 | 类型定义 | 作用 |
|------|---------|------|
| `focusSet` | `(focusId: string, groupOrOptions?: string \| FocusSetOptions) => void` | 强制激活。将焦点立即切换到指定的 `focusId`。如果指定了 `group`，则在该组内切换。 |
| `focusNext` | `(groupOrOptions?: string \| FocusSetOptions) => void` | 前进循环。在当前组或默认组中，按注册顺序将焦点移动到**下一个**目标（Tab 键行为）。 |
| `focusPrev` | `(groupOrOptions?: string \| FocusSetOptions) => void` | 后退循环。在当前组或默认组中，按注册顺序将焦点移动到**上一个**目标（Shift+Tab 键行为）。 |
| `focusCurrent` | `(groupOrOptions?: string \| FocusSetOptions) => FocusCurrentResult` | 查询当前焦点。返回当前持有焦点的 `focusId` 及其所属组。用于调试或读取当前状态（不触发渲染）。 |

## 焦点是什么，焦点目标又是什么

**焦点**，就是键盘事件的"话筒"。在终端这种只有一个"输入通道"的环境里，一个屏幕上往往有多个组件在抢按键，但同一时刻，只会有一个目标收到事件——它被路由给当前"持有话筒"的那个，其它目标即使注册了完全相同的按键，也会被引擎跳过。这正是我们开头抛出的那个问题："当多个组件或者绑定同时存在且互相冲突时，按键事件到底该路由给谁"。

那什么是**焦点目标**（FocusTarget）呢？它是屏幕上可以被焦点命中的**命名槽位**。每个焦点目标都有一个唯一的 `focusId`，并各自维护一组属于自己的绑定：

```tsx
boundKeyboard(["up", "down"], handleUpDown, { focusId: "select-a" })
```

这个 `focusId: "select-a"` 是在告诉引擎：这条绑定不属于屏幕本身，而是属于名为 `select-a` 的焦点目标。这样一来，每个 `SelectInput` 的上下箭头绑定就各归其位，不再互相纠缠。

不过你可能会想：屏幕上既然可以有多个焦点目标，它们是不是会一起响应按键？答案是不会。这里有一条核心规则——**每个组在同一时刻只允许存在一个激活的焦点**。

在内部，每个屏幕的键盘图层都维护着一张"焦点表"，它记录着三样东西：注册了哪些焦点目标、它们按什么顺序排列、当前哪个处于激活状态。其中"组"是关键：默认组、以及后续才会讲到的命名组，每个组内同时只有**一个**焦点处于激活状态。当你把焦点从 `select-a` 切到 `select-b` 时，`select-a` 会立即"让位"，焦点表里始终只保留其中一个。

当按键到达屏幕栈阶段时，引擎会先解析当前激活的焦点，然后**只尝试这个焦点上的绑定**；不持有焦点的目标，即使它注册的按键与按下的一致，也不会被匹配。即焦点目标把"谁绑定按键"与"谁能收到按键"彻底分开了——绑定只是把按键"登记"进目标里，能不能收到，取决于这个目标是否处于激活状态。

回到开头的例子——两个 `SelectInput` 冲突的根源，就是它们的绑定都直接注册在了屏幕上（没有 `focusId`），处于"永远激活"的状态，每次按键都要一起比较。一旦给每个组件指定独立的 `focusId`，它们各自的绑定就各归其位，路由与否完全由焦点说了算。

## 理解焦点的生命周期

焦点的创建遵循一个核心原则，它不会在组件渲染的时候直接创建，而是伴随着绑定注册时被隐式创建，即**惰性创建**，好处是可以让焦点注册变得简单灵活且无感知，你完全不知道发生了什么。

### 核心触发时机

在 `boundKeyboard` 或者 `boundSequence` 方法调用时且带有 `focusId` 的时候，键盘引擎会执行创建逻辑。目前我们不会涉及 `boundSequence` 序列键方法，而是仅涉及 `boundKeyboard` 。

``` tsx
boundKeyboard(["s"], () => doSomething(), { focusId: "submit-btn" })
```
引擎会检查当前屏幕的默认组是否已存在名为 submit-btn 的焦点。如果已经存在引擎会把这个绑定直接注册进去，否则引擎会自动创建一个新的然后注册进去。

### 自动激活：第一个焦点无需手动指定

引擎创建焦点的过程是"取或建"（get or create）：同名焦点已存在就复用，否则新建。而在创建新焦点的同时，引擎还会顺带做一件事——**如果这是当前屏幕上第一个被创建的焦点，引擎会立即让它成为激活状态**，即自动持有焦点。这意味着当一个屏幕只有一个焦点目标时，你完全不需要手动调用 `focusSet`：绑定注册完成的那一刻，焦点就已经属于它了。

```tsx
function SelectInput({ focusId }: { focusId: string }) {
    const { boundKeyboard } = useKeyboard()

    useEffect(() => {
        return boundKeyboard(["up", "down"], () => {/**...*/}, { focusId })
    }, [boundKeyboard, focusId])

    return (/**...*/)
}

// 屏幕上第一个被注册的 focusId 会自动持有焦点
<SelectInput focusId="select-a" />
<SelectInput focusId="select-b" />
```

注册 `select-a` 时，这是屏幕上的第一个焦点，引擎会激活它；注册 `select-b` 时，屏幕上已经存在激活的焦点，引擎不会再自动切换，`select-b` 只是安静地加入焦点顺序，等待 `focusNext` / `focusPrev` / `focusSet` 将焦点移交过来。

回到开头的场景：两个 `SelectInput` 各自持有自己的 `focusId` 后，按键事件只会路由给当前持有焦点的那个——另一个组件虽然也注册了相同的上下箭头，但因为不持有焦点，它的绑定会被引擎直接跳过。冲突就此消除。

### 解绑绑定并不会注销焦点

这里有一个容易混淆的点：**焦点的生命周期与绑定的生命周期并不同步**。

`boundKeyboard` 返回的解绑函数，只会把对应的绑定从这个焦点上移除，而焦点本身依然存在——它仍然占据着焦点顺序中的一个位置。也就是说，即使某个 `focusId` 上的绑定已经被全部解绑，引擎也不会自动回收它。

这保证了焦点顺序的确定性：它只受 `focusSet`、`focusNext`、`focusPrev`、`focusUnregister` 等显式操作影响，而不会因为某个绑定的临时解绑而悄悄变化。

**可选行为：`releaseFocusWhenEmpty`**

开启 `releaseFocusWhenEmpty` 引擎选项（`KeyboardProvider` 也有同名 prop）后，每个绑定都会为自己注册的焦点目标增加一个引用，最后一个引用释放时目标被移除。再次为同一个 `focusId` 注册绑定会重新创建它；焦点会交给组内第一个剩余目标，组里没有目标时清空该组的焦点槽。该选项默认关闭，所以大多数应用看到的就是上面描述的行为。

### 焦点在什么时候被注销

焦点的注销只有两个来源：**显式注销**与**随屏幕销毁**。

**显式注销：`focusUnregister`**

`useKeyboard` 提供了 `focusUnregister(focusId)` 用于主动注销一个焦点：

```tsx
const { focusUnregister } = useKeyboard()

// 注销名为 select-b 的焦点
focusUnregister("select-b")
```

- 如果被注销的焦点恰好是当前激活的焦点，引擎会把焦点**自动移交给组内注册顺序中的第一个剩余焦点**；
- 如果组内已经没有剩余焦点，焦点槽位会被清空，此时 `focusCurrent()` 返回 `noFound`，表示当前没有任何焦点处于激活状态，也没有任何绑定会响应按键。

**随屏幕销毁：导航离开**

焦点并不属于组件本身，而是依附于当前屏幕的键盘图层。当屏幕从导航路径中移除（例如 `skip`、`back`、`gotoScreen`），该屏幕对应的整个键盘图层——连同图层下的所有焦点——都会被一并销毁。因此离开一个屏幕后，这个屏幕的焦点状态不会残留到下一个屏幕。

> 注意：需要区分"组件卸载"与"屏幕离开"。组件卸载只会触发绑定的解绑（见上文"解绑绑定并不会注销焦点"），焦点依然留在屏幕上；只有屏幕离开导航路径，焦点才会随图层一起被销毁。如果希望在组件卸载时同步清理焦点，请在 `useEffect` 的清理函数中调用 `focusUnregister`。

## 控制焦点的四个基本方法

上面我们在"基础焦点方法预览"中预告了四个方法，现在逐一来看它们怎么用。这四个方法都接受一个可选的"组"参数，用于在命名组内操作；本文章不涉及多组概念，因此下面的示例均省略该参数，组相关的用法会在后续文章中讲解。

### 使用 `focusSet` 强制切换焦点

`focusSet` 是四个方法里最直接的一个：**强制把焦点切换到指定的 `focusId`**。

```tsx
const { focusSet } = useKeyboard()

// 把焦点切到 select-b
focusSet("select-b")
```

调用之后，`select-b` 立即成为当前激活的焦点，按键事件也随之路由到它上面的绑定。

这里有一个前提需要特别注意：**`focusSet` 只能作用于已经注册的焦点**。由于焦点是惰性创建的（见上文"理解焦点的生命周期"），你必须先通过一条带 `focusId` 的绑定把它"诞生"出来，`focusSet` 才能命中它：

```tsx
useEffect(() => {
    // 先注册，焦点 select-a 才会存在
    const unA = boundKeyboard(["up", "down"], handleA, { focusId: "select-a" })

    // 此刻 focusSet 才能命中
    focusSet("select-a")

    return unA
}, [boundKeyboard, focusSet])
```

如果 `focusSet` 指向一个尚未注册的 `focusId`，引擎会抛出错误：

```
[keyboard-engine] focusSet("select-missing"): focus target not found on "Menu". Available targets: "select-a", "select-b"
```

### 使用 `focusNext` / `focusPrev` 循环移动焦点

与 `focusSet` 的"指哪打哪"不同，`focusNext` / `focusPrev` 是**沿着注册顺序移动焦点**：`focusNext` 移到下一个目标（Tab 键行为），`focusPrev` 移到上一个目标（Shift+Tab 键行为），并且到末尾会**循环回绕**——最后一个的"下一个"是第一个。

```tsx
const { focusNext, focusPrev } = useKeyboard()

// 沿注册顺序：select-a → select-b → select-a ...
boundKeyboard(["tab"], () => focusNext())
boundKeyboard(["shift+tab"], () => focusPrev())
```

这里的"注册顺序"，就是绑定被注册的先后顺序：先注册 `select-a` 再注册 `select-b`，那么 `focusNext` 就会从 `select-a` 走到 `select-b`。

两个细节值得注意：

- 如果当前组内**没有激活的焦点**，`focusNext` / `focusPrev` 什么都不做——它们是"接着当前焦点继续走"，而不是"凭空挑一个"；
- 如果组内**只有一个焦点**，`focusNext` / `focusPrev` 会原地不动——下一位还是它自己。

如果你不想手动绑定 Tab，也可以让引擎替你处理。`KeyboardProvider` 提供了一个 `autoTab` 选项，开启后引擎会自动拦截 Tab / Shift+Tab 并调用 `focusNext` / `focusPrev`：

```tsx
<KeyboardProvider autoTab>
    <CurrentScreen />
</KeyboardProvider>
```

> 注意：`autoTab` 会同时接管 Tab 与 Shift+Tab。如果你需要把其中任一键留给自定义逻辑，就不要开启它，而是像上面那样手动绑定。引擎默认匹配 `tab` 与 `shift+tab`；直接使用引擎且键名规范化器产出别的名字时，用 `tabKey` 指定（见 [不使用 React 时](/zh/keyboard/non-react)）。

### 使用 `focusCurrent` 查询当前焦点

前三个方法是"动手改"，`focusCurrent` 则是"读"——**返回当前激活的焦点**。

```tsx
const { focusCurrent } = useKeyboard()

const result = focusCurrent()
// result 形如 { result: { id: "select-b" } }
```

实践中最常用的是读取 `result?.id` 拿到当前焦点的 id：

```tsx
const current = focusCurrent().result?.id   // 例如 "select-b"
```

当屏幕上没有任何激活的焦点时，`result` 不存在，取而代之的是 `noFound: true`——可以用来判断"当前什么都没有聚焦"。

需要特别强调的是，**`focusCurrent` 不会触发渲染**：它只是读取引擎里的一份状态快照，适合在事件回调里判断"当前焦点在哪"。如果你想让界面跟随焦点变化而自动更新，还需要一个配套的钩子——`useFocusState`，我们接着看。

### 使用 `useFocusState` 驱动焦点高亮

`useFocusState` 接收一个 `focusId`，返回一个布尔值——**当这个 `focusId` 正持有焦点时为 `true`**，并且会在焦点发生变化时自动触发重渲染：

```tsx
const focused = useFocusState("select-b")
// select-b 持有焦点时 focused 为 true，否则为 false
```

它订阅引擎的焦点通知，任何焦点变化（`focusSet`、`focusNext`、`focusPrev`、`focusUnregister` 都会触发通知）都会让组件重新渲染。布尔值本身在渲染时根据当前焦点和你传入的参数读取，所以同一个组件换成另一个 `focusId` 或分组时，那一次渲染就能显示新目标的状态，不必等下一次焦点移动。

它非常适合用来渲染"当前选中"的视觉反馈：

```tsx
function Menu() {
    const focused = useFocusState("select-b")

    return (
        <Box>
            <Text bold={focused}>选择栏 B</Text>
            <Text dimColor>{focused ? "正在操作选择栏 B" : "按 Tab 切到这里"}</Text>
        </Box>
    )
}
```

与 `focusCurrent` 相比，它们是互补的两种用法：

| | `focusCurrent` | `useFocusState` |
| :--- | :--- | :--- |
| 角色 | 命令式查询 | 声明式订阅 |
| 返回值 | 当前焦点 id 等状态快照 | 该 `focusId` 是否持有焦点的布尔值 |
| 是否触发渲染 | 否 | 焦点变化时自动重渲染 |
| 适用场景 | 事件回调里判断"现在焦点在哪" | 组件里渲染焦点高亮 |

`useFocusState` 同样接受一个可选的组参数，本文章不涉及多组概念，此处省略。

### 综合示例：切换两个选择栏

把四个方法串起来，一个用焦点系统切换两个选择栏的屏幕大致长这样。这里的选择栏是一个**独立组件**，它接收 `focusId` 属性，并在内部把上下箭头的绑定注册到属于自己的焦点目标上——这正是 `packages` 里 `SelectInput` 组件的真实写法：

```tsx
function SelectInput({ focusId, items }: { focusId: string; items: string[] }) {
    const { boundKeyboard } = useKeyboard()
    const focused = useFocusState(focusId)
    const [index, setIndex] = useState(0)

    // 组件内部把自己的按键注册到自己的焦点目标上
    useEffect(() => {
        const unUp = boundKeyboard(["up"], () => setIndex(prev => Math.max(0, prev - 1)), { focusId })
        const unDown = boundKeyboard(["down"], () => setIndex(prev => Math.min(items.length - 1, prev + 1)), { focusId })

        return () => { unUp(); unDown() }
    }, [boundKeyboard, focusId, items.length])

    return (
        <Box flexDirection="column">
            {items.map((item, i) => (
                <Text key={item} bold={focused && i === index}>{item}</Text>
            ))}
        </Box>
    )
}
```

屏幕本身只负责把两个 `SelectInput` 摆放出来，并绑定 Tab / Shift+Tab 在它们之间轮转焦点——按键的归属完全由各组件内部负责：

```tsx
function Menu() {
    const { boundKeyboard, focusNext, focusPrev } = useKeyboard()

    useEffect(() => {
        const unTab = boundKeyboard(["tab"], () => focusNext())
        const unShiftTab = boundKeyboard(["shift+tab"], () => focusPrev())

        return () => { unTab(); unShiftTab() }
    }, [boundKeyboard, focusNext, focusPrev])

    return (
        <Box flexDirection="column">
            <Text dimColor>偏好设置</Text>
            <SelectInput focusId="select-a" items={["选项 1", "选项 2", "选项 3"]} />
            <SelectInput focusId="select-b" items={["选项 A", "选项 B"]} />
            <Text dimColor>按 Tab 切换焦点，按上下箭头操作当前选择栏</Text>
        </Box>
    )
}
```

由于第一个注册的焦点会被自动激活（见上文"自动激活"），屏幕挂载时 `select-a` 即持有焦点，只有它内部的上下箭头绑定会响应按键；按 Tab 在两者之间循环，当前持有焦点的选择栏会加粗显示。两个组件虽然注册了完全相同的上下箭头，却互不冲突——它们已经被各自的 `focusId` 隔离开来。

## 最佳实践

1. **想让焦点真正消失时，调用 `focusUnregister`，而不只是解绑** —— 解绑只会清空焦点上的绑定，焦点本身还留在焦点顺序里：`focusNext` 依然会经过它，`focusCurrent` 也仍能读到它。如果组件被条件渲染移除后，你希望它从焦点顺序中消失，请在清理函数里补上 `focusUnregister`。

2. **需要指定初始焦点时，`focusSet` 要放在绑定注册之后** —— 第一个注册的焦点会被自动激活；如果你想让初始焦点落在别处，就先在 `useEffect` 里注册所有 `focusId`，再调用 `focusSet`，否则会因目标尚未注册而抛错。

3. **用 `useFocusState` 驱动界面，而不是 `focusCurrent`** —— `focusCurrent` 只是读取一份状态快照，不会触发渲染；需要让高亮、光标跟随焦点变化，请用 `useFocusState` 订阅。

4. **`autoTab` 与手动绑定 Tab 二选一** —— 开启 `autoTab` 后，Tab / Shift+Tab 会由引擎拦截并自动轮转焦点，此时再手动把 `focusNext` 绑到 Tab 键上就没有意义了。需要自定义 Tab 行为时，关闭 `autoTab`，像上文那样手动绑定。

5. **给可交互组件起一个语义化的 `focusId`** —— `focusId` 是组件在焦点世界里的身份证，取一个稳定、可读的名字（如 `select-a`、`submit-btn`），会让 `focusSet`、调试与后续维护都更轻松。

## 完整示例

到这里，我们把焦点系统的各个部分串成一个**完整可运行**的应用：两个选择栏共用同一组上下箭头按键，却因为各自的 `focusId` 互不干扰，Tab / Shift+Tab 在它们之间轮转焦点。将代码保存为 `.tsx` 文件，执行 `npx tsx <文件名>.tsx` 即可运行。

```tsx
import React, { useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useFocusState,
  useKeyboard,
} from 'ink-cartridge';

// 一个选择栏组件：接收 focusId，并在内部把按键注册到自己的焦点目标上
function SelectInput({ focusId, items }: { focusId: string; items: string[] }) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const unUp = boundKeyboard(['up'], () => setIndex((prev) => Math.max(0, prev - 1)), { focusId });
    const unDown = boundKeyboard(['down'], () => setIndex((prev) => Math.min(items.length - 1, prev + 1)), { focusId });

    return () => {
      unUp();
      unDown();
    };
  }, [boundKeyboard, focusId, items.length]);

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={item} bold={focused && i === index}>{item}</Text>
      ))}
    </Box>
  );
}

function Menu() {
  const { boundKeyboard, focusNext, focusPrev } = useKeyboard();

  useEffect(() => {
    const unTab = boundKeyboard(['tab'], () => focusNext());
    const unShiftTab = boundKeyboard(['shift+tab'], () => focusPrev());

    return () => {
      unTab();
      unShiftTab();
    };
  }, [boundKeyboard, focusNext, focusPrev]);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">  
        <Text bold>偏好设置</Text>
      </Box>
      <Box flexDirection="row">  
        <SelectInput focusId="select-a" items={['选项 1', '选项 2', '选项 3']} />
        <SelectInput focusId="select-b" items={['选项 A', '选项 B']} />
      </Box>
      <Text dimColor>按 Tab 切换焦点，按上下箭头操作当前选择栏</Text>
    </Box>
  );
}

// 注册 Menu 为根屏幕
registerComponent(Menu, {});

// 应用入口：KeyboardProvider 必须嵌套在 ScenarioManagementProvider 内部
render(
  <ScenarioManagementProvider defaultScreen={Menu} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>
);
```

运行效果
<div align="center">
    <img src="/zh/docs-focus-system.gif" width="2040" alt="focus-system" />
</div>
