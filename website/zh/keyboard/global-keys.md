# 全局键绑定：`globalKeys` 与 `globalSequence`

`globalKeys` 登记**不依赖屏幕栈与图层**的按键：只要栈顶屏幕落在它的 `category` 白名单内，按键就触发——用来承载「整个应用都该响应」的键，例如全局退出、切换主题。`globalSequence` 是它的多键版本。

```typescript
globalKeys(entries: GlobalKeyEntry[], options?: { mode?: "replace" | "add" }): void
globalSequence(entries: GlobalSequenceEntry[], options?: { mode?: "replace" | "add" }): void
```

从 `useKeyboard()` 取出调用。两者**不返回解绑函数**：一次调用是整份替换或追加，见下文「注册方式」。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 全局键沿用同一套键名格式与 `operate` 语义 |
| [多键序列](/zh/keyboard/boundSequence) | `globalSequence` 是序列的全局版，`timeout` / `exclusive` 行为一致 |
| [图层间的键盘事件](/zh/screen/layer-keyboard) | `affectLayer` 决定全局键落在层间传播的哪一相 |

## 与 `boundKeyboard` 的区别

| | `boundKeyboard` | `globalKeys` |
|---|---|---|
| 归属 | 挂在当前屏幕 / 图层 / 元素上 | 全局一份，与归属无关 |
| 生效范围 | 所属屏幕（或元素激活）时 | 栈顶屏幕在 `category` 内即可 |
| 注册方式 | 每次调用新增一条，返回解绑函数 | 整份替换或追加，无返回值 |
| 键名格式 | 归一化键名（`"s"`、`"ctrl+q"`、`"return"`） | 相同 |

## 在管线中的位置

`affectLayer` 把它放进 9 阶段管线中的不同相：

| `affectLayer` | 触发时机 | 可覆盖它的绑定 | 无图层打开时 |
|---|---|---|---|
| `false`（默认） | 层广播**之后**、屏幕栈之前 | 屏幕绑定（`boundKeyboard`） | 正常触发 |
| `true` | 层广播**之前** | 图层元素绑定 | 默认跳过，除非 `executeWhenNoOverlay: true` |

`affectLayer: true` 的是「覆盖相」全局键：它先于任何图层拿到按键，因此适合放在被图层遮挡也仍要生效的快捷键上。

## `GlobalKeyEntry` 选项

- `key` {string | string[]} 归一化键名，单个或一组。
- `operate` {() => void | string} 回调；或已注册的快捷键**动作 id**，取其回调。
- `category` {unknown[] | "*"} 白名单：哪些屏幕可触发，见下文。
- `cover` {boolean} 是否允许屏幕覆盖此键。 **默认值：** `true`。
- `affectLayer` {boolean} 触发相，见上表。 **默认值：** `false`。
- `times` {number} 累计按满多少次才触发（≥ 1）。 **默认值：** 每次触发。
- `observer` {(remaining: number) => void} 计数期间每次按键的回调，接收**还需几次**；依赖 `times`。
- `when` {(() => boolean) | string} 条件（回调或命名条件 id），为假时跳过。
- `mode` {string} 仅在指定模式下生效（模式需预先注册）。
- `executeWhenNoOverlay` {boolean} 仅 `affectLayer: true` 时有意义：无图层打开也触发。

### `category`

`category` 按**栈顶屏幕**过滤：`"*"` 或省略表示所有屏幕；`[]` 表示任何屏幕都不触发（等于禁用）；`[Menu, Game]` 只在栈顶恰为 `Menu` 或 `Game` 时触发。

```tsx
// 全局退出：所有屏幕都生效
globalKeys([{ key: "q", operate: () => process.exit(0) }])

// 仅在游戏与菜单屏幕上生效
globalKeys([{ key: "p", operate: pause, category: [Game, Menu] }])
```

### `cover`

`cover` 控制屏幕能否用 `boundKeyboard` 认领同一个键：

- `cover: true`（默认）：某屏幕绑定了同名的键，则在该屏幕上这个全局键被**跳过**——本屏的绑定优先。
- `cover: false`：全局键**不可被覆盖**。若白名单内的屏幕（或元素）再绑定同一个键，注册时直接抛错 `... declared in globalKeys with cover: false, so overriding is not allowed.`

```tsx
// 全局强制退出，任何屏幕都不得改绑 q
globalKeys([{ key: "q", operate: () => process.exit(0), cover: false }])
```

### `times` 与 `observer`

`times` 让全局键需要连按若干次才触发；计数器按 entry 累计、不自动归零，触发后回到 0。`observer` 在每次按键时被调用，参数是**还差几次**：

```tsx
// 连按三次 ctrl+x 才退出，期间提示剩余次数
globalKeys([
  {
    key: "ctrl+x",
    times: 3,
    operate: () => process.exit(0),
    observer: (remaining) => setHint(`再按 ${remaining} 次退出`),
  },
])
```

### `when` 与 `mode`

与其他绑定一致：`when` 为假时该 entry 整体被跳过；`mode` 只在当前模式匹配时生效。

```tsx
globalKeys([{ key: "s", operate: save, when: () => isDirty, mode: "normal" }])
```

## `globalSequence`

全局序列匹配多键组合，选项与 `GlobalSequenceEntry` 如下。它与 `globalKeys` 的差别：**不支持 `times` / `observer`**，且 `cover` 只能被 `boundSequence` 覆盖（普通 `boundKeyboard` 不参与该判断）。

- `keys` {string[]} 序列键名，**至少两个**，否则抛错。
- `operate` {() => void | string} 回调；或已注册的**序列动作 id**。
- `timeout` {number} 相邻按键的最大间隔（毫秒）。 **默认值：** `500`。
- `exclusive` {boolean} 按错键时：`false` 取消序列并落到底层；`true` 静默吞掉。 **默认值：** `false`。
- `cover` {boolean} 是否允许 `boundSequence` 覆盖。 **默认值：** `true`。
- `affectLayer` {boolean} 触发相，语义同全局键。 **默认值：** `false`。
- `category` {unknown[] | "*"} 屏幕白名单，语义同全局键。
- `when` {(() => boolean) | string} 条件。
- `mode` {string} 限定模式。
- `executeWhenNoOverlay` {boolean} 仅 `affectLayer: true` 时有意义。

```tsx
// 任意屏幕上 g g 回到顶部
globalSequence([{ keys: ["g", "g"], operate: scrollToTop }])

// 覆盖相：图层打开时也生效；700ms 内按完
globalSequence([
  { keys: ["ctrl+t", "t"], operate: toggleTheme, affectLayer: true, executeWhenNoOverlay: true, timeout: 700 },
])
```

## 注册方式：`replace` 与 `add`

两个函数默认**整份替换**上一次注册的全局键 / 序列；传 `{ mode: "add" }` 则把新条目追加到已有列表，且**不会**清除待续的序列。整份替换会清除正在等待中的全局序列。

```tsx
useEffect(() => {
  globalKeys([{ key: "q", operate: quit }])                 // 替换：只剩 q
  return () => globalKeys([], { mode: "replace" })          // 卸载时清空
}, [])

// 追加：保留 q，再加一条
globalKeys([{ key: "r", operate: reload }], { mode: "add" })
```

## 读取当前注册项

```tsx
const { getGlobalKeys, getGlobalSequences, getGlobalPendingSequence } = useKeyboard()

getGlobalKeys()             // 已解析的全局键条目
getGlobalSequences()        // 已解析的全局序列条目
getGlobalPendingSequence()  // 正在等待后续键的全局序列，无则 null
```
