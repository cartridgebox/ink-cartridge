/**
 * Mouse Drag Demo — drag a window around the terminal.
 *
 * Demonstrates the drag lifecycle: `press` inside the window arms a capture,
 * the first `drag` event fires `onDragStart` (recording the grab offset),
 * subsequent `drag` events fire `onDragMove` (window follows the cursor),
 * and `release` fires `onDragEnd`. A plain click (press + release without
 * movement) only fires `onClick` — no drag callbacks.
 *
 * Controls:
 *   r — reset window position
 *   q — quit
 *
 * Run:
 *   npx tsx examples/mouse-drag.tsx
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useMouseRegion,
} from '../src/index.js';

function DraggableWindow() {
  const [pos, setPos] = useState({ top: 3, left: 3 });
  const [dragging, setDragging] = useState(false);
  const [clicks, setClicks] = useState(0);
  const offsetRef = useRef({ dx: 0, dy: 0 });

  const ref = useMouseRegion({
    onClick: () => setClicks((n) => n + 1),
    onDragStart: (event, rect) => {
      // Grab offset: where inside the window the cursor was when the drag began.
      offsetRef.current = { dx: event.x - rect.x, dy: event.y - rect.y };
      setDragging(true);
    },
    onDragMove: (event) => {
      // Keep the grab offset fixed: window top/left (0-based) = cursor (1-based) - offset - 1.
      setPos({
        top: event.y - offsetRef.current.dy - 1,
        left: event.x - offsetRef.current.dx - 1,
      });
    },
    onDragEnd: () => setDragging(false),
  });

  return (
    <Box
      position="absolute"
      top={pos.top}
      left={pos.left}
      width={28}
      height={7}
      borderStyle="round"
      borderColor={dragging ? 'green' : 'white'}
      flexDirection="column"
      padding={1}
      ref={ref}
    >
      <Text bold>Draggable Window</Text>
      <Text dimColor>{dragging ? 'dragging... release to drop' : 'press and drag the window'}</Text>
      <Text>clicks: {clicks}</Text>
      <Text dimColor>pos: {pos.left},{pos.top}</Text>
    </Box>
  );
}

function DragScreen() {
  const { boundKeyboard } = useKeyboard();
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const reset = boundKeyboard(['r'], () => setResetKey((n) => n + 1));
    const quit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      reset();
      quit();
    };
  }, [boundKeyboard]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Mouse Drag Demo — window dragging via drag capture</Text>
      <Text dimColor>Press inside the window and move to drag · click counts · r reset · q quit</Text>
      <DraggableWindow key={resetKey} />
    </Box>
  );
}
registerComponent(DragScreen, {});

function App() {
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={DragScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
