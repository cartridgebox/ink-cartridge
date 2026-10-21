# Quick Start

ink-cartridge enhances React Ink without replacing it. It does not constrain application code, and its parts compose freely: screen system, layered keyboard engine, and mouse integration.

## Install

```bash
npm install ink-cartridge
```

`react` and `ink` are peer dependencies and must be installed in the host project.

## Minimal app

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

## Structure

| Piece | Role |
|---|---|
| `ScenarioManagementProvider` | Screen state, navigation, layers; `defaultScreen` sets the first screen and `fullScreen` fills the terminal |
| `registerComponent` | Registers a component into the screen tree; `{ parent }` sets the hierarchy |
| `CurrentScreen` | Renders the active screen |
| `KeyboardProvider` | Keyboard engine; must nest inside the screen provider |
| `useScreenSystem` | `skip` / `back` / `gotoScreen` and the layer API |
| `useKeyboard` | Bindings, focus, modes, global keys |

Placing `KeyboardProvider` outside `ScenarioManagementProvider`, or omitting the screen provider, makes the keyboard silently inert.

::: tip
Ink names the Enter key `'return'`, not `'enter'`.
:::
