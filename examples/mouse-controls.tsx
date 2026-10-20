/**
 * Mouse Controls Demo — clickable buttons inside a panel.
 *
 * A panel registers a mouse region (priority 0). Two buttons — `[x]` and
 * `[OK]` — register child regions with a higher priority (1), so clicks on
 * a button hit the button only, while clicks elsewhere on the panel hit the
 * panel body. Clicking `[x]` closes the panel; `r` reopens it.
 *
 * Priority is required because React mounts children before parents: without
 * it the buttons would register *before* the panel and lose overlap
 * resolution.
 *
 * Controls:
 *   r — reopen the panel
 *   q — quit
 *
 * Run:
 *   npx tsx examples/mouse-controls.tsx
 */
import React, { useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useMouseRegion,
} from '../src/index.js';

function MouseButton({
  label,
  onPress,
  priority = 1,
}: {
  label: string;
  onPress: () => void;
  priority?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const ref = useMouseRegion(
    {
      onClick: () => {
        setPressed(true);
        onPress();
      },
      onEnter: () => setHovered(true),
      onLeave: () => setHovered(false),
    },
    { priority },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={hovered ? 'green' : pressed ? 'red' : 'gray'}
      width={label.length + 2}
      ref={ref}
    >
      <Text>{label}</Text>
    </Box>
  );
}

function ControlPanel({
  onClose,
  onOk,
}: {
  onClose: () => void;
  onOk: () => void;
}) {
  const [panelClicks, setPanelClicks] = useState(0);
  const [panelHovered, setPanelHovered] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  const panelRef = useMouseRegion(
    {
      onClick: (event) => {
        setPanelClicks((n) => n + 1);
        setLast(`(${event.x},${event.y}) ${event.button}`);
      },
      onEnter: () => setPanelHovered(true),
      onLeave: () => setPanelHovered(false),
    },
    { priority: 0 },
  );

  return (
    <Box
      position="absolute"
      top={4}
      left={4}
      width={36}
      height={9}
      borderStyle="round"
      borderColor={panelHovered ? 'green' : 'white'}
      flexDirection="column"
      padding={1}
      ref={panelRef}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Control Panel</Text>
        <MouseButton label="[x]" onPress={onClose} />
      </Box>
      <Text dimColor>panel clicks: {panelClicks}</Text>
      <Text dimColor>{last ?? 'click anywhere in the panel (buttons are separate)'}</Text>
      <Box flexDirection="row" justifyContent="flex-end">
        <MouseButton label="[OK]" onPress={onOk} />
      </Box>
    </Box>
  );
}

function ControlsScreen() {
  const [open, setOpen] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const reopen = boundKeyboard(['r'], () => setOpen(true));
    const quit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      reopen();
      quit();
    };
  }, [boundKeyboard]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Mouse Controls Demo — buttons on a panel</Text>
      <Text dimColor>Click [x] to close · [OK] to confirm · panel body counts · r reopen · q quit</Text>
      {action && <Text color="green">action: {action}</Text>}

      {open ? (
        <ControlPanel
          onClose={() => {
            setOpen(false);
            setAction('close pressed');
          }}
          onOk={() => setAction('OK pressed')}
        />
      ) : (
        <Text dimColor>Panel closed — press r to reopen</Text>
      )}
    </Box>
  );
}
registerComponent(ControlsScreen, {});

function App() {
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={ControlsScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
