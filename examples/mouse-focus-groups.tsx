/**
 * Multi-Focus Groups Demo — every box owns its own named focus group, so any
 * number of boxes can hold keyboard focus at the same time.
 *
 * Clicking a box toggles its focus group: focus it if idle, kick it if
 * focused (green border, ● marker). Because each box lives in its own group,
 * clicking Alpha, Beta and Gamma keeps all three focused simultaneously.
 *
 * The keys a/b/c are bound group-scoped, so they only respond while their
 * box already holds focus — pressing a focused box's key toggles it off.
 *
 * Controls:
 *   a / b / c — toggle the matching box (only while it holds focus)
 *   x — kick all focus groups
 *   q — quit
 *
 * Run:
 *   npx tsx examples/mouse-focus-groups.tsx
 */
import React, { useCallback, useEffect, useState } from 'react';
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

const GROUPS = [
  { label: 'Alpha', group: 'g-alpha', focusId: 'alpha', keyName: 'a' },
  { label: 'Beta', group: 'g-beta', focusId: 'beta', keyName: 'b' },
  { label: 'Gamma', group: 'g-gamma', focusId: 'gamma', keyName: 'c' },
] as const;

function GroupBox({
  label,
  group,
  focusId,
  onToggle,
}: {
  label: string;
  group: string;
  focusId: string;
  onToggle: () => void;
}) {
  const focused = useFocusState(focusId, group);
  const [hovered, setHovered] = useState(false);
  const [count, setCount] = useState(0);

  const ref = useMouseRegion({
    onClick: () => {
      setCount((n) => n + 1);
      onToggle();
    },
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

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
      <Text dimColor>clicks {count}</Text>
    </Box>
  );
}

function MultiFocusScreen() {
  const { boundKeyboard, focusSet, kickFocusGroup, focusCurrent } = useKeyboard();
  const [ready, setReady] = useState(false);

  const toggleGroup = useCallback(
    (group: string, focusId: string) => {
      const cur = focusCurrent(group);
      if (cur.result) {
        kickFocusGroup(group);
      } else {
        focusSet(focusId, group);
      }
    },
    [focusCurrent, kickFocusGroup, focusSet],
  );

  // Register all three groups before mounting the boxes so the group-aware
  // children only render once their groups exist.
  useEffect(() => {
    const unbinds = GROUPS.map((g) =>
      boundKeyboard([g.keyName], () => toggleGroup(g.group, g.focusId), {
        focusId: { group: g.group, focusId: g.focusId },
      }),
    );
    setReady(true);
    return () => unbinds.forEach((unbind) => unbind());
  }, [boundKeyboard, toggleGroup]);

  // The first group is auto-selected on registration; kick all so the demo
  // starts with every box unfocused.
  useEffect(() => {
    if (!ready) return;
    GROUPS.forEach((g) => kickFocusGroup(g.group));
  }, [ready, kickFocusGroup]);

  if (!ready) return <Text>setting up focus groups…</Text>;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Multi-Focus Groups Demo — independent focus per box</Text>
      <Text dimColor>
        Click a box to toggle its focus; all three can stay focused at once.
      </Text>

      <Box marginTop={1} flexDirection="row" gap={2}>
        {GROUPS.map((g) => (
          <GroupBox
            key={g.group}
            label={g.label}
            group={g.group}
            focusId={g.focusId}
            onToggle={() => toggleGroup(g.group, g.focusId)}
          />
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          a/b/c toggle only while that box holds focus · x kicks all groups · q quit
        </Text>
      </Box>
    </Box>
  );
}
registerComponent(MultiFocusScreen, {});

function App() {
  const { boundKeyboard, kickFocusGroup } = useKeyboard();
  useEffect(() => {
    const quit = boundKeyboard(['q'], () => process.exit(0));
    const kickAll = boundKeyboard(['x'], () => {
      GROUPS.forEach((g) => kickFocusGroup(g.group));
    });
    return () => {
      quit();
      kickAll();
    };
  }, [boundKeyboard, kickFocusGroup]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={MultiFocusScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
