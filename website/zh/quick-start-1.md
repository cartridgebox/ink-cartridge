# 快速开始

ink-cartridge 增强 React Ink 而不替换它。它不约束业务代码，各部分能力可以按需组合：屏幕系统、分层键盘引擎、鼠标联动。

## 安装

```bash
npm install ink-cartridge
```

`react` 与 `ink` 通过 `peerDependencies` 提供，需要自行安装。

## 最小应用

```tsx
import React, { useEffect } from 'react'
import { Text, render } from 'ink'
import {
  CurrentScreen,
  KeyboardProvider,
  ScenarioManagementProvider,
  registerComponent,
  useKeyboard,
  useScreenSystem,
} from 'ink-cartridge'

function Home() {
  const { skip } = useScreenSystem()
  const { boundKeyboard } = useKeyboard()

  useEffect(() => boundKeyboard('return', () => skip(Detail)), [boundKeyboard, skip])

  return <Text>Home — press Enter</Text>
}
registerComponent(Home)

function Detail() {
  const { back } = useScreenSystem()
  const { boundKeyboard } = useKeyboard()

  useEffect(() => boundKeyboard('escape', () => back()), [boundKeyboard, back])

  return <Text>Detail — press Esc</Text>
}
registerComponent(Detail, {}, { parent: Home })

render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
)
```

```bash
npx tsx app.tsx
```

## 结构

| 部件 | 作用 |
|---|---|
| `ScenarioManagementProvider` | 屏幕状态、导航、图层；`defaultScreen` 指定首屏，`fullScreen` 占满终端 |
| `registerComponent` | 把组件注册进屏幕树；`{ parent }` 建立父子关系 |
| `CurrentScreen` | 渲染当前屏幕 |
| `KeyboardProvider` | 键盘引擎；必须嵌套在屏幕 Provider 内部 |
| `useScreenSystem` | `skip` / `back` / `gotoScreen` 与图层 API |
| `useKeyboard` | 绑定、焦点、模式、全局键等 |

`KeyboardProvider` 放在 `ScenarioManagementProvider` 外层或省略屏幕 Provider 时，键盘会静默失效。

::: tip
Ink 中 Enter 键的名字是 `'return'`，不是 `'enter'`。
:::
