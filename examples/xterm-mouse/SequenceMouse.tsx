/**
 * Sequence × Mouse Demo — the three `boundSequence` calling conventions
 * driven by mouse focus.
 *
 * Three fire panels, each a clickable mouse region. Clicking a panel hands
 * keyboard focus to it (green border, ● marker) via the region-focus link
 * recorded by `boundSequence(keys, actionId, { ref, focusId })`. Only the
 * focused panel's sequence starts, so the same `x x` keys behave differently
 * per panel.
 *
 * `boundSequence` calling conventions on display:
 *   1. explicit keys + callback      — `c c` fires the global action
 *   2. explicit keys + action id     — `x x` fires the FOCUSED panel's action
 *      (the panel actions carry NO preset keys — only this overload can bind
 *      them; their timeout is overridden per call)
 *   3. action id only, preset keys   — `g g` fires the global action
 *
 * Controls:
 *   click a panel — focus it (green border)
 *   x x — fire the focused panel's action
 *   g g — fire the global action (form 3: action preset keys)
 *   c c — fire the global action (form 1: explicit callback)
 *   q — quit
 *
 * Run:
 *   npx tsx examples/xterm-mouse/SequenceMouse.tsx
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

/** Explicit keys shared by every panel — bound per-panel via an action id. */
const FIRE_KEYS = ['x', 'x'];

function SequencePanel({
  label,
  actionId,
  focusId,
}: {
  label: string;
  actionId: string;
  focusId: string;
}) {
  const { boundSequence, defineSequenceAction } = useKeyboard();
  const focused = useFocusState(focusId);
  const [hovered, setHovered] = useState(false);
  const [shots, setShots] = useState(0);

  const ref = useMouseRegion({
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  useEffect(() => {
    // The action carries only a callback — no preset keys. Only the
    // boundSequence(keys, actionId) overload can bind such an action.
    defineSequenceAction([
      { sequenceActionId: actionId, action: () => setShots((n) => n + 1) },
    ]);
    // Form 2: explicit keys + action id. The ref/focusId pair also records
    // the region-focus link: clicking the panel focuses it, and the x x
    // sequence then only starts while this panel holds focus.
    return boundSequence(FIRE_KEYS, actionId, { ref, focusId, timeout: 600 });
  }, [boundSequence, defineSequenceAction, actionId, ref, focusId]);

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
      <Text dimColor>x x → {shots}</Text>
    </Box>
  );
}

function SequenceScreen() {
  const { boundSequence, defineSequenceAction } = useKeyboard();
  const [globalShots, setGlobalShots] = useState(0);

  useEffect(() => {
    defineSequenceAction([
      {
        sequenceActionId: 'global-fire',
        action: () => setGlobalShots((n) => n + 1),
        keys: ['g', 'g'],
      },
    ]);
    // Form 3: action id only — uses the action's preset keys g g
    const seq3 = boundSequence('global-fire');
    // Form 1: explicit keys + callback
    const seq1 = boundSequence(
      ['c', 'c'],
      () => setGlobalShots((n) => n + 1),
      { timeout: 500 },
    );
    return () => {
      seq3();
      seq1();
    };
  }, [boundSequence, defineSequenceAction]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        Sequence × Mouse Demo — click a panel, then fire its sequence
      </Text>
      <Text dimColor>
        Click a panel to focus it (green border), then press its sequence.
      </Text>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <SequencePanel label="Alpha" actionId="alpha-fire" focusId="panel-alpha" />
        <SequencePanel label="Beta" actionId="beta-fire" focusId="panel-beta" />
        <SequencePanel label="Gamma" actionId="gamma-fire" focusId="panel-gamma" />
      </Box>

      <Box marginTop={1}>
        <Text>Global fires: {globalShots}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          x x — fire the focused panel (form 2: keys + actionId) · g g — global
          (form 3: preset keys) · c c — global (form 1: callback) · q quit
        </Text>
      </Box>
    </Box>
  );
}
registerComponent(SequenceScreen, {});

function App() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(['q'], () => process.exit(0));
  }, [boundKeyboard]);
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={SequenceScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
