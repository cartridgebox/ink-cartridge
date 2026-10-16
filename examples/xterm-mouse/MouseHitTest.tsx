/**
 * Mouse Hit-Test Demo — prove that xterm-mouse works inside an Ink app
 * through the engine's mouse region hit-testing (`useMouseRegion`).
 *
 * Draws an 8x8 box registered as a mouse region. Clicking a cell marks it
 * with an 'X'; hovering the box turns its border green.
 *
 * Coordinate model:
 * - `useMouseRegion` measures the box and registers it in 1-based terminal
 *   coordinates (assumes full-screen rendering, viewport offset 0).
 * - xterm-mouse events are 1-based terminal coordinates.
 *
 * Controls:
 *   q — quit
 *
 * Run:
 *   npx tsx examples/xterm-mouse/MouseHitTest.tsx
 */
import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import {
  registerComponent,
  ScenarioManagementProvider,
  CurrentScreen,
  KeyboardProvider,
  useKeyboard,
  useMouseRegion,
} from '../../src/index.js';

const GRID = 8;
const GRID_AREA = GRID * GRID;

function MouseHitTestScreen() {
  const [marks, setMarks] = useState<Set<number>>(() => new Set());
  const [hitCount, setHitCount] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [lastClick, setLastClick] = useState<string | null>(null);

  const boxRef = useMouseRegion({
    onClick: (event, rect) => {
      setLastClick(
        `(${event.x},${event.y}) ${event.button} via ${event.protocol}` +
          `${event.shift ? ' +shift' : ''}${event.alt ? ' +alt' : ''}${event.ctrl ? ' +ctrl' : ''}`,
      );
      // Local cell position: content area starts after the 1-cell border.
      const col = event.x - rect.x - 1;
      const row = event.y - rect.y - 1;
      if (col >= 0 && col < GRID && row >= 0 && row < GRID) {
        setMarks((prev) => {
          if (prev.has(row * GRID + col)) return prev;
          const next = new Set(prev);
          next.add(row * GRID + col);
          return next;
        });
      }
      setHitCount((n) => n + 1);
    },
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  const filled = marks.size;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Mouse Hit-Test Demo — useMouseRegion + KeyboardProvider mouse</Text>
      <Text dimColor>Click inside the box to mark a cell · hover to highlight · q to quit</Text>

      <Box marginTop={1} flexDirection="row" gap={2}>
        <Box
          ref={boxRef}
          borderStyle="round"
          borderColor={hovered ? 'green' : undefined}
          width={GRID + 2}
          height={GRID + 2}
          flexDirection="column"
        >
          {Array.from({ length: GRID }, (_, row) => (
            <Box key={row} height={1}>
              {Array.from({ length: GRID }, (_, col) => (
                <Box key={col} width={1}>
                  <Text>{marks.has(row * GRID + col) ? 'X' : ' '}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text>
            Cells filled: <Text color="green">{filled}</Text> / {GRID_AREA}
          </Text>
          <Text>Clicks on box: {hitCount}</Text>
          <Text>Hover: {hovered ? <Text color="green">inside</Text> : 'outside'}</Text>
          {lastClick && <Text>Last click: {lastClick}</Text>}
        </Box>
      </Box>
    </Box>
  );
}
registerComponent(MouseHitTestScreen, {});

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
  <ScenarioManagementProvider defaultScreen={MouseHitTestScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
