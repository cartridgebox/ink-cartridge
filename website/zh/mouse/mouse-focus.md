# 鼠标驱动键盘焦点

鼠标区域可以把收到的点击或悬停，转发成键盘焦点的切换。同一个组件既能被鼠标点中，也能被键盘选中，两条输入通道收敛到同一个焦点目标。

开关是三个选项：`clickOnFocus`、`enterOnFocus`、`leaveOffFocus`。

## 前置知识

| 文章 | 为什么需要 |
|---|---|
| [基本绑定](/zh/keyboard/base-bind) | 联动靠 `boundKeyboard` 的 `ref` 与 `focusId` 选项建立 |
| [焦点系统](/zh/keyboard/focus-system) | 需要理解焦点目标、`focusId` 与 `useFocusState` |
| [绑定方法的归属与所有者栈](/zh/screen/binding-attribution) | 联动记录在调用方所属的作用域里，归属决定它记到哪 |

## 机制：一张按 ref 对象索引的表

联动在底层就是一张表：

```typescript
type RegionFocusEntry = { focusId: string | FocusRef };
type RegionFocusMap = Map<RefObject<DOMElement | null>, RegionFocusEntry>;
```

**表的键是 ref 对象本身**，不是 `regionId`，也不是元素的 id。这是「必须用同一个 ref 对象」的全部原因——查表按对象身份进行，哪怕你新造一个内容和它一样的 ref，也查不到。

这张表挂在**页面**和**每个图层 / 模态层**上，所以它能在 `CurrentScreen` 反复重渲染之间存活，不会被重建清空。

登记和查询各自发生在自己的作用域里，两者必须落在同一张表上：

| 时机 | 取哪张表 |
|---|---|
| `boundKeyboard({ ref, focusId })` 登记 | 调用处所属的作用域 |
| 鼠标事件查表 | `useMouseRegion` 调用处所属的作用域 |

作用域优先级为**图层元素 > 模态层元素 > 当前页面**。实践中两者通常写在同一个组件里，自然一致；只有把绑定写在屏幕、而 ref 来自图层内元素时才会错开。

## 用同一个 ref 建立联动

把 `useMouseRegion` 返回的 ref **同一个对象**，同时交给 `useMouseRegion` 自身和 `boundKeyboard` 的 `ref` 选项：

```tsx
function FocusButton({ focusId }: { focusId: string }) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);

  const ref = useMouseRegion({
    onClick: () => activate(),
  });

  useEffect(() => {
    return boundKeyboard(['s'], () => activate(), { ref, focusId });
  }, [boundKeyboard, ref, focusId]);

  return (
    <Box ref={ref} borderStyle="round" borderColor={focused ? 'green' : 'gray'}>
      <Text>{focused ? '●' : '○'} press s or click</Text>
    </Box>
  );
}
```

两个 hook 分工不同，缺一不可：

- `useMouseRegion` 负责测量矩形、命中测试，并在事件来临时**查表**
- `boundKeyboard` 的 `{ ref, focusId }` 负责**写表**，它同时正常地登记按键绑定

少了 `{ ref, focusId }`，点击只是一个普通回调，焦点不会动。

> `ref` 必须是**对象 ref**，且必须是**同一个对象**。传 callback ref 会被拒绝并退回内部 ref，联动随之失效——这个失败是静默的，没有警告、没有报错。

同一个 ref 可以被多条绑定共用。内部按 ref 计数，登记几次就要释放几次，条目才在最后一次解绑时移除：

```tsx
// 两条绑定共用一个 ref 与一个 focusId
boundKeyboard(['s'], () => activate(), { ref, focusId });
boundKeyboard(['return'], () => activate(), { ref, focusId });
```

`boundKeyboard` 返回的取消函数已经把「解除绑定」和「减少联动计数」合成了一次调用，重复调用是幂等的，直接交给 `useEffect` 清理即可。

## 事件触发时的执行顺序

`useMouseRegion` 并非把你传的回调原样注册——它用一层包装替换了 `onClick` / `onEnter` / `onLeave`：**先做焦点转发，再调用你自己的回调**。

焦点在引擎中是**同步**更新的，所以回调执行时引擎里的焦点已经变了；但组件里 `useFocusState` 返回的布尔值要等下一次渲染才跟上。想在回调内部立刻拿到最新焦点，用 `focusCurrent()` 而不是本次渲染里的 `focused` 变量——前者是同步查询。

| 回调 | 顺序 |
|---|---|
| `onClick` | `clickOnFocus` 转发焦点 → 你的 `onClick` |
| `onEnter` | `enterOnFocus` 转发焦点 → 你的 `onEnter` |
| `onLeave` | 清空焦点（条件见下）→ 你的 `onLeave` |

转发时如果表里没有这个 ref 的条目，内部直接返回、什么都不做。所以未联动的区域是安全的静默空操作。

## `clickOnFocus`：点击切换焦点

默认**开启**，且开启是显式的判断——`undefined` 与 `true` 一视同仁：

```tsx
const ref = useMouseRegion({ onClick: () => setCount((n) => n + 1) });
```

这段没写 `clickOnFocus`，点击照样会切焦点（前提是这个 ref 已用 `{ ref, focusId }` 登记过）。想让点击保持纯鼠标行为，显式关掉：

```tsx
const ref = useMouseRegion(
  { onClick: () => setCount((n) => n + 1) },
  { clickOnFocus: false },
);
```

区域位于图层元素内时，转发还会带上**元素作用域**——焦点设置在 `focusSet(focusId, { element })` 的约束下生效，只影响该元素内的绑定。

## `enterOnFocus` / `leaveOffFocus`：悬停驱动焦点

`enterOnFocus` 默认**关闭**；打开后鼠标移入即切换焦点：

```tsx
const ref = useMouseRegion(
  { onEnter: () => setHovered(true), onLeave: () => setHovered(false) },
  { enterOnFocus: true },
);
```

`leaveOffFocus` 控制移出时是否清空焦点，默认 `true`，但它**只在 `enterOnFocus` 为 `true` 时才参与判断**。这是刻意设计的：如果移出就无条件清焦点，一个只配了 `clickOnFocus` 的区域，用户在点完之后把鼠标挪开，刚点出来的焦点会被莫名其妙地清掉。所以只点不悬停的区域完全不受 `leaveOffFocus` 影响。

| `enterOnFocus` | `leaveOffFocus` | 行为 |
|---|---|---|
| `false` | 不参与 | 只有点击切焦点 |
| `true` | `true`（默认） | 移入切焦点，移出清焦点 |
| `true` | `false` | 移入切焦点，移出**保留**焦点 |

`leaveOffFocus: false` 适合悬停只是临时预览、但焦点必须留住的目标，例如边缘很窄、鼠标容易滑出的面板。三种模式可以对照 `MouseHoverFocus.tsx` 的三个面板。

移出时清除用的是 `kickFocusGroup`，它把该组**当前持有的焦点摘掉**，而不是回退到上一个焦点——所以移出之后再移回去，焦点是重新被设置的，不存在「恢复现场」。

## 命名组

`focusId` 可以写成 `FocusRef` 形式 `{ group, focusId }`，把联动接到命名组上：

```tsx
useEffect(
  () =>
    boundKeyboard(['s'], () => activate(), {
      ref,
      focusId: { group: 'nav', focusId: 'nav-item-1' },
    }),
  [boundKeyboard, ref],
);
```

转发与清除会分别走两条不同的分支，这一点值得留意：

| 条目形态 | 移入 / 点击 | 移出 |
|---|---|---|
| `focusId` 是字符串 | 设置焦点（默认组） | `kickFocusGroup()` —— 清默认组 |
| `focusId` 是 `FocusRef` | 设置焦点（指定组） | `kickFocusGroup({ group })` —— 清**那个命名组** |

也就是说，移出清掉的是**整个组当前持有的焦点**，而不是严格地清掉你登记的那一个 `focusId`。若同一个命名组里还挂着别的焦点目标，它也会一并被摘掉。多焦点组的概念见[默认组与命名组](/zh/keyboard/focus-group)。

## 联动同样适用于 `boundSequence`

写表的不只是 `boundKeyboard`——`boundSequence(keys, actionId, { ref, focusId })` 也登记同样的条目。区别在点击切完焦点之后才体现：只有持有焦点的那个区域的序列会开始匹配，于是同一组按键在不同面板上可以走不同分支（见 `SequenceMouse.tsx`）。

## 联动没生效时按这四条排查

失效是静默的，所以按顺序确认：

1. **Provider 开了鼠标吗** —— `<KeyboardProvider mouse>`，否则区域根本收不到事件
2. **是同一个 ref 对象吗** —— 传给 `useMouseRegion` 和 `boundKeyboard` 的必须是同一个引用；包装组件要把它透传出来
3. **是不是 callback ref** —— `(node) => {...}` 这种形式会被拒绝，必须是 `useRef` / `useMouseRegion` 产出的对象 ref
4. **作用域一致吗** —— 写表的 `boundKeyboard` 和查表的 `useMouseRegion` 要落在同一张表上（同一组件内即为一致）
