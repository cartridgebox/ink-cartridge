/**
 * Mouse → Focus Demo — clicking a mouse region hands keyboard focus to the
 * focusId its `boundKeyboard` registered, so the mouse and the keyboard
 * converge on the same focus target.
 *
 * Three clickable buttons. Each button:
 *   - registers a mouse region (`useMouseRegion`) for hover + click
 *   - binds a key scoped to its `focusId`, passing the SAME ref
 * Clicking a button injects `focusSet(focusId)` (green border, ● marker);
 * the button's key then activates only while it holds focus, and doing the
 * same action as a click.
 *
 * The first registered focusId is auto-selected, so Alpha starts focused.
 *
 * Controls:
 *   a / b / c — activate the focused button's key (only the focused one)
 *   q — quit
 *
 * Run:
 *   npx tsx examples/xterm-mouse/MouseFocus.tsx
 */
import React, { useEffect, useState } from 'react';
import { render, Box, Text } from 'ink';
import {
  registerComponent,
  ScenarioManagementProvider,
  CurrentScreen,
  KeyboardProvider,
  useKeyboard,
  useFocusState,
  useMouseRegion,
} from '../../src/index.js';

function FocusButton({
  label,
  keyName,
  focusId,
}: {
  label: string;
  keyName: string;
  focusId: string;
}) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [hovered, setHovered] = useState(false);
  const [count, setCount] = useState(0);

  const ref = useMouseRegion({
    onClick: () => setCount((n) => n + 1),
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  useEffect(() => {
    return boundKeyboard([keyName], () => setCount((n) => n + 1), {
      ref,
      focusId,
    });
  }, [boundKeyboard, keyName, ref, focusId]);

  return (
    <Box
      ref={ref}
      borderStyle="round"
      borderColor={focused ? 'green' : hovered ? 'yellow' : undefined}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      alignItems="center"
    >
      <Text>
        {focused ? <Text color="green">●</Text> : '○'} {label}
      </Text>
      <Text dimColor>
        key {keyName} · {count}
      </Text>
    </Box>
  );
}

function MouseFocusScreen() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Mouse → Focus Demo — click to move keyboard focus</Text>
      <Text dimColor>
        Click a button to hand it focus (green border); hover shows yellow. Its key then works as a
        click.
      </Text>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <FocusButton label="Alpha" keyName="a" focusId="btn-alpha" />
        <FocusButton label="Beta" keyName="b" focusId="btn-beta" />
        <FocusButton label="Gamma" keyName="c" focusId="btn-gamma" />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          ● focused · ○ not focused · a/b/c activate the focused button · q quit
        </Text>
      </Box>
    </Box>
  );
}
registerComponent(MouseFocusScreen, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(['q'], () => process.exit(0));
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={MouseFocusScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
