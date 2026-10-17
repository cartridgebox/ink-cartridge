---
name: write-example
description: Write demo/example files for ink-cartridge components and APIs. Use when the user wants to create a demo, write an example, or add a showcase for a component or API.
---

## Entry

**Must** first ask the user to choose an interaction mode:

1. **Auto-explore** — AI reads source and existing examples, analyzes, drafts boilerplate, writes after user confirms
2. **Step-by-step** — AI asks the user one question at a time; user drives the scope

Then **must** ask: new example or updating existing example?

## Auto-explore workflow (new example)

1. Ask: which component/API needs an example?
2. Read the source file — extract props signature, `focusId` usage, keyboard hooks (`useKeyboard`, `overlay`, `openModal`), state requirements
3. **Must** read at least one existing example from the same category to match style. Categories:
   - **Simple** — Badge, Spinner, Divider, KeyHint, ProgressBar, theme-only, i18n-only. No `focusId`, no keyboard hooks, no navigation.
   - **Interactive** — NumberInput, Tabs, Form, Fold, MultiSelectInput, SearchBar, SearchInput. Has `focusId` or keyboard bindings.
   - **With overlay/modal** — core/overlay, core/modal. Calls `overlay()` or `openModal()`.
4. Determine the pattern from the component source:
   - Simple → direct `render(<Demo />)`, no providers, no `registerComponent`
   - Interactive → `registerComponent(Demo, {})` + `<ScenarioManagementProvider><KeyboardProvider><CurrentScreen /></>`
   - With overlay/modal → Interactive + `fullScreen` + `useWindowSize()` + `position="absolute"`
5. Draft the complete demo and present it to the user
6. User confirms; write the file to `examples/<group>-<name>.tsx`
7. **Must** run `npx tsc -p examples/tsconfig.json --noEmit` and ensure it passes
8. **Must** update `examples/README.md` — add a row to the correct table (Component Demos or Core System Demos)

If tsc reports any type errors, **must** fix them and re-run until clean.

## Auto-explore workflow (update existing example)

1. Read the existing demo file
2. Read the source for changed props/signatures
3. Identify precise differences
4. Update the demo to reflect the current API; **must not** rewrite the whole file
5. Show the diff to the user for confirmation
6. Write the changes
7. **Must** run `npx tsc -p examples/tsconfig.json --noEmit`

## Step-by-step workflow (new example)

1. Ask: which component/API needs an example?
2. Ask: which features/variants should be demonstrated?
3. Read the source and at least one existing example of the same category
4. List the features to demonstrate; user confirms
5. Generate the demo
6. **Must** run `npx tsc -p examples/tsconfig.json --noEmit`
7. **Must** update `examples/README.md`

## Step-by-step workflow (update existing example)

1. Ask: which demo file and what specifically changed?
2. Read existing demo + source
3. Show the identified differences; user confirms
4. Modify affected sections only

## Boilerplate templates

### Simple (static) pattern

```tsx
import React from 'react';
import { render, Box, Text } from 'ink';
import { ComponentName } from '@cartridge-engine/<name>';

function Demo() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>ComponentName demo</Text>
      <Box flexDirection="column" marginTop={1} gap={1}>
        {/* showcase variants here */}
      </Box>
    </Box>
  );
}

render(<Demo />);
```

### Interactive pattern

```tsx
import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import {
  registerComponent,
  ScenarioManagementProvider,
  CurrentScreen,
  KeyboardProvider,
} from '../src/index.js';
import { ComponentName } from '@cartridge-engine/<name>';
import { Divider } from '@cartridge-engine/divider';
import { KeyHint } from '@cartridge-engine/key-hint';

function Demo() {
  const [value, setValue] = useState(/* default */);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>ComponentName demo</Text>
      <Text dimColor>Tab to switch focus</Text>

      <Box flexDirection="column" marginTop={1} gap={1}>
        {/* showcase variants here */}
      </Box>

      <Divider />

      <KeyHint keys={[
        { key: 'Tab', desc: 'Switch focus' },
        { key: 'q', desc: 'Quit' },
      ]} />
    </Box>
  );
}

registerComponent(Demo, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  React.useEffect(() => {
    const unbind = boundKeyboard(['q'], () => process.exit(0));
    return unbind;
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={Demo}>
    <KeyboardProvider>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
```

### Overlay/modal positioning (add to interactive pattern)

```tsx
const OVERLAY_W = 40;
const OVERLAY_H = 8;

function center(width: number, height: number, cols: number, rows: number) {
  return {
    top: Math.max(0, Math.floor((rows - height) / 2)),
    left: Math.max(0, Math.floor((cols - width) / 2)),
  };
}

// Inside overlay component:
const { columns, rows } = useWindowSize();
const { top, left } = center(OVERLAY_W, OVERLAY_H, columns, rows);

<Box
  position="absolute"
  top={top}
  left={left}
  width={OVERLAY_W}
  height={OVERLAY_H}
  borderStyle="round"
  borderColor="blue"
  padding={1}
  backgroundColor="black"
>
```

And on the provider:

```tsx
<ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
```

## Non-negotiable conventions

- File naming: `<group>-<name>.tsx`, flat in `examples/` (e.g. `keyboard-dormant-key.tsx`, `mouse-hover-focus.tsx`)
- Groups: `screen-`, `keyboard-`, `mouse-` — the subsystem the demo belongs to
- All text **must** be in English — comments, UI strings, key descriptions
- **Must** use JSX; `React.createElement` is forbidden
- Overlay/modal components **must** use `position="absolute"` + `useWindowSize()` centering + `backgroundColor="black"` + `fullScreen` on provider
- Single-API showcase only. Multi-system stress scenarios belong in test suites, not in examples
- **Must** add a keyboard shortcut to exit (`q` → `process.exit(0)`) in every interactive demo
- **Must** update `examples/README.md` when adding a new demo
- **Must not** write test files under `examples/`
- **Must** run `npx tsc -p examples/tsconfig.json --noEmit` and ensure zero errors
- In the interactive pattern, `KeyboardProvider` **must** nest inside `ScenarioManagementProvider` (reversed silently breaks keyboard)

## Audit reminder

After writing the demo, **must** remind the user: verify the demo reflects the current component API — no stale props, no missing features, features shown are correct for the latest version.
