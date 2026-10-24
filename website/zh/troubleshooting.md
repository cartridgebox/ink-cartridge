# 故障排除

按症状归类。多数失效是静默的，先检查归属、Provider 顺序与图层状态。

## 排查顺序

1. Provider 嵌套。
2. 所有者是否活跃：屏幕在栈中、图层已打开、元素 `active`。
3. 焦点：`focusCurrent()` 与组的激活目标。
4. 模态屏障或 `allowModal`。
5. `mode`、`when` 与命名条件。
6. 精确键与通配符的先后顺序。

大多数"按键没反应"在第 1 或第 2 步就能定位。

## 按键无响应

| 可能原因 | 检查 |
|---|---|
| Provider 嵌套反了 | `KeyboardProvider` 必须在 `ScenarioManagementProvider` 内层 |
| 归属不活跃 | 屏幕是否在栈中、图层是否打开、元素是否 `active` |
| 被条件挡住 | 检查 `mode`、`when`、命名条件是否注册 |
| 焦点不在目标上 | 同层内只有激活焦点目标的绑定参与匹配；用 `focusCurrent()` 确认 |
| 模态层独占 | 未处理的键被屏障吞掉；用 `allowModal` 放行 |
| `stopsWorkingAfterLayerAppearing` | 任意图层打开时页面绑定休眠 |
| 通配符被精确键抢先 | 需要 `'*'` 优先时调用 `enableWildcardPriority()` |

## 幽灵按键

离开屏幕后旧绑定仍然响应：绑定注册在 `useEffect` 中但没有返回解绑函数。让 effect 返回它，或手动调用。

## 焦点

- **解绑后目标消失**：开启 `releaseFocusWhenEmpty` 时，最后一次解绑会移除目标；重新注册同一 `focusId` 可重建。
- **`focusSet` 返回 `false`**：目标尚未注册（惰性创建），先注册带 `focusId` 的绑定。
- **命名组不响应**：组的第一个目标会自动激活；只有被 `kickFocusGroup` 清空的组才需要 `activateFocusGroup`。`autoTab` 只轮转默认组。

## 图层

- **打开后看不到内容**：`openLayer` 只创建空容器，需要 `applyElement`。
- **图层被页面切换清掉**：`crossPage` 默认 `false`。
- **跨页图层抢键盘**：设置 `automaticTakeoverKeyboard` 限定生效页面。
- **`bringLayerToFront` 无效**：只作用于普通图层；模态层与未注册 ID 会被忽略并告警。
- **`penetration` 名字容易误解**：它是放行；要拦截用 `stop`。

## 鼠标

- **区域不响应**：确认 `<KeyboardProvider mouse>`、TTY 输入输出、ref 已挂到 Box、Box 不是 0×0。
- **点击不切焦点**：`useMouseRegion` 与 `boundKeyboard` 必须收到同一个对象 ref；callback ref 会静默失效。
- **`onDragMove` 中断**：拖拽目标在按下时捕获，理论上不会中断；检查组件是否在拖拽中卸载。
- **重叠区域点错**：调高子控件的 `priority`。

## 组合与序列

- **链没有记录撤销**：只有超时、`isEndKey`、`execute` 返回 `null` 才记录；无匹配键会丢弃。
- **撤销抛错**：请求数量超过缓冲；用 `bufferedCompositionCount()` 先查询。
- **序列不触发**：检查 `timeout`、是否按错键（`exclusive`）、以及焦点目标是否激活。

## 常见错误信息

| 信息 | 原因 |
|---|---|
| `[ink-cartridge] No KeyboardEngine is mounted. …getEngine()…` | 未挂载 `KeyboardProvider` 就调用模块级 API |
| `[ink-cartridge] Condition "<id>" is not registered. …` | 使用了未注册的命名条件 |
| `[keyboard-engine] <fn>() must be called inside a screen component or overlay.` | 无 owner 时调用了带归属的方法 |
| `… declared in globalKeys with cover: false, so overriding is not allowed.` | 覆盖了 `cover: false` 的全局键 |
| `Cannot undo N sequence(s): only M buffered.` | 撤销数量超过缓冲 |
| `[ink-cartridge] Mouse tracking requires a TTY input stream …` | 非 TTY 环境开启鼠标 |

## 测试

- `ink-testing-library` 下 Escape（`\x1b`）不可靠。
- 副作用在 `flush()`（约 50ms）之后才稳定。
- 在 `beforeEach` 中调用 `clearRegistry()` 做隔离。

## TypeScript

- TSX 中 `useRef<<T>` 会被解析为 JSX，必须写 `useRef<T>`。
