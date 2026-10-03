# 故障排除

跨章节的常见陷阱与错误信息，按症状归类。

## 按键无响应

- **Provider 嵌套反了**：`KeyboardProvider` 必须在 `ScenarioManagementProvider` 内层，顺序反了会静默失效。
- **归属不对**：绑定只在其 owner（屏幕 / 图层元素）活跃时命中，见[绑定方法的归属与所有者栈](/zh/screen/binding-attribution)。
- **被 `mode` / `when` 挡住**：检查绑定的 `mode` 与 `when`，见[模式](/zh/keyboard/modes)与[中级绑定](/zh/keyboard/boundKeyboard-advanced)。
- **模态层独占**：模态层默认拦截所有按键，需要时用 `allowModal` 放行，见[allowModal 放行键盘事件](/zh/screen/allow-modal)。

## 分层与传播

- **`penetration` 是放行不是拦截**（名字易误解）；要拦截用 `stop`。见[键的穿透](/zh/keyboard/penetration)与[停止键传播](/zh/keyboard/stop)。
- **跨页图层被回收**：非持久图层与模态层（`crossPage: false`）在 `skip` / `back` / `gotoScreen` 时被移除（在 reducer 内处理）。

## 错误边界

- `_dispatch` 在 `useEffect` 中设置，`componentDidCatch` 期间不可用——错误边界里调用图层 / 模态函数会拿到 `null`。

## 测试

- `ink-testing-library` 下 Escape（`\x1b`）不可靠；`stdin.write` 的转义序列行为不稳定。

## 类型

- TSX 中 `useRef<<T>` 会被当作 JSX——必须写成 `useRef<T>`。

## 常见错误信息

| 信息 | 原因 |
|---|---|
| `[ink-cartridge] No KeyboardEngine is mounted. …getEngine()…` | 未挂载 `KeyboardProvider` 就调用了模块级 API |
| `[ink-cartridge] Condition "<id>" is not registered. …` | 使用了未注册的命名条件，先 `addCondition` |
| `[keyboard-engine] <fn>() must be called inside a screen component or overlay.` | 无 owner 时调用了 `stop` / `penetration` 等 |
| `… declared in globalKeys with cover: false, so overriding is not allowed.` | 覆盖了 `cover: false` 的全局键 |
