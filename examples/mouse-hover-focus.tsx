/**
 * Hover Focus Demo — `enterOnFocus` / `leaveOffFocus` / `clickOnFocus`.
 *
 * Three panels. Hovering a panel hands keyboard focus to its focusId; leaving
 * the panel clears it (unless `leaveOffFocus: false`). The focused panel is
 * shown with a green border and ● marker, and its `s` key only works while it
 * holds focus.
 *
 * Panel modes on display:
 *   Alpha — enterOnFocus: focus follows the mouse in AND out (leaveOffFocus
 *           defaults to true, so leaving clears the focus)
 *   Beta  — enterOnFocus + leaveOffFocus:false: hover focuses, leaving KEEPS
 *           the focus — useful for tooltips that must survive the cursor
 *           leaving their edge
 *   Gamma — clickOnFocus only: hover never touches focus; only a click moves
 *           it (and a click elsewhere takes it away, but leaving the panel
 *           never clears it)
 *
 * Controls:
 *   hover a panel — focus follows the mouse (Alpha/Beta)
 *   s — fire the focused panel's key (only the focused one responds)
 *   click — move focus to the clicked panel (Gamma, or any panel)
 *   q — quit
 *
 * Run:
 *   npx tsx examples/mouse-hover-focus.tsx
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
} from '../src/index.js';

function HoverPanel({
  label,
  mode,
  focusId,
  enterOnFocus,
  leaveOffFocus,
  clickOnFocus,
}: {
  label: string;
  mode: string;
  focusId: string;
  enterOnFocus?: boolean;
  leaveOffFocus?: boolean;
  clickOnFocus?: boolean;
}) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [hovered, setHovered] = useState(false);
  const [keys, setKeys] = useState(0);

  const ref = useMouseRegion(
    {
      onEnter: () => setHovered(true),
      onLeave: () => setHovered(false),
    },
    { enterOnFocus, leaveOffFocus, clickOnFocus },
  );

  useEffect(() => {
    return boundKeyboard(['s'], () => setKeys((k) => k + 1), { ref, focusId });
  }, [boundKeyboard, ref, focusId]);

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
      <Text dimColor>{mode}</Text>
      <Text dimColor>s → {keys}</Text>
    </Box>
  );
}

function HoverFocusScreen() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        Hover Focus Demo — the mouse drives keyboard focus
      </Text>
      <Text dimColor>
        Hover a panel to focus it (green border); leave it and the focus
        clears — except Beta, which keeps it.
      </Text>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <HoverPanel
          label="Alpha"
          mode="hover (leave clears)"
          focusId="panel-alpha"
          enterOnFocus
        />
        <HoverPanel
          label="Beta"
          mode="hover (leave keeps)"
          focusId="panel-beta"
          enterOnFocus
          leaveOffFocus={false}
        />
        <HoverPanel
          label="Gamma"
          mode="click only"
          focusId="panel-gamma"
          clickOnFocus
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          s fires the focused panel · hover Alpha/Beta to follow · click Gamma
          to focus it · q quit
        </Text>
      </Box>
    </Box>
  );
}
registerComponent(HoverFocusScreen, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(['q'], () => process.exit(0));
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={HoverFocusScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
