/**
 * Bring-To-Front Demo — draggable panels that raise their regular layers.
 *
 * Three draggable panels on a black background, each on its own regular
 * layer. Click a panel (`clickOnRise`) or start dragging it (`dragOnRise`)
 * to raise its layer above the others: the layer's zIndex becomes max + 1,
 * so the panel jumps to the top of the visual stack AND takes over the
 * shared 'x' key. The live layer order is printed on the page. A modal
 * layer demonstrates that regular layers never rise above modals, and that
 * clicks under a modal cannot reach the layers beneath.
 *
 * Controls:
 *   click / drag a panel — raise its layer (clickOnRise / dragOnRise)
 *   r / y / b             — raise the red / yellow / blue layer
 *   x                     — key of the topmost panel (increments its key counter)
 *   m                     — open a modal layer
 *   q                     — quit (closes the modal first while it is open)
 *
 * Run:
 *   npx tsx examples/core/bring-to-front.tsx
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  LayerElementContext,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useMouseRegion,
  useScreenSystem,
} from '../../src/index.js';

function Panel({
  label,
  color,
  top,
  left,
}: {
  label: string;
  color: string;
  top: number;
  left: number;
}) {
  const layerCtx = useContext(LayerElementContext);
  const { allLayers } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  const [keyCount, setKeyCount] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ top, left });
  const offsetRef = useRef({ dx: 0, dy: 0 });

  // clickOnRise: the click raises THIS panel's layer before the user's own
  // onClick runs; dragOnRise does the same when a drag starts. The element
  // itself never remounts, so its state (including the drag position)
  // survives every raise.
  const ref = useMouseRegion(
    {
      onClick: () => setClickCount((n) => n + 1),
      onEnter: () => setHovered(true),
      onLeave: () => setHovered(false),
      onDragStart: (event, rect) => {
        // Grab offset: where inside the panel the cursor was when the drag began.
        offsetRef.current = { dx: event.x - rect.x, dy: event.y - rect.y };
        setDragging(true);
      },
      onDragMove: (event) => {
        // Keep the grab offset fixed: panel top/left (0-based) = cursor (1-based) - offset - 1.
        setPos({
          top: event.y - offsetRef.current.dy - 1,
          left: event.x - offsetRef.current.dx - 1,
        });
      },
      onDragEnd: () => setDragging(false),
    },
    { clickOnRise: true, dragOnRise: true },
  );

  useEffect(() => {
    return boundKeyboard(['x'], () => setKeyCount((n) => n + 1));
  }, [boundKeyboard]);

  const zIndex = layerCtx?.layer.zIndex;
  const isTop =
    allLayers[allLayers.length - 1]?.layerId === layerCtx?.layer.layerId;

  return (
    <Box
      ref={ref}
      position="absolute"
      top={pos.top}
      left={pos.left}
      width={26}
      height={6}
      borderStyle="round"
      borderColor={dragging ? 'green' : hovered ? 'cyan' : color}
      backgroundColor="black"
    >
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={color}>
          {label} {isTop ? '◀ TOP' : ''}
        </Text>
        <Text>zIndex: {zIndex}</Text>
        <Text>
          x-keys: {keyCount} clicks: {clickCount}
        </Text>
        <Text dimColor>
          pos: {pos.left},{pos.top}
          {dragging ? ' (dragging)' : ''}
        </Text>
      </Box>
    </Box>
  );
}

function ModalPanel() {
  const { boundKeyboard } = useKeyboard();
  const { closeModalLayer } = useScreenSystem();

  useEffect(() => {
    return boundKeyboard(['q'], () => closeModalLayer('m'));
  }, [boundKeyboard, closeModalLayer]);

  return (
    <Box
      position="absolute"
      top={11}
      left={6}
      width={48}
      height={7}
      borderStyle="double"
      borderColor="magenta"
      backgroundColor="black"
    >
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="magenta">
          MODAL (z=100)
        </Text>
        <Text>Regular layers can never rise above me — try clicking a panel.</Text>
        <Text dimColor>press q to close the modal</Text>
      </Box>
    </Box>
  );
}

function MainScreen() {
  const {
    openLayer,
    applyElement,
    bringLayerToFront,
    openModalLayer,
    applyElementToModalLayer,
    allLayers,
    allModalLayers,
  } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  // Open the three base layers exactly once — re-running this on later
  // renders would re-open panels the demo never closed.
  useEffect(() => {
    openLayer('red', 1);
    applyElement('red', {
      elementId: 'red-el',
      element: Panel,
      props: { label: 'RED', color: 'red', top: 2, left: 2 },
    });
    openLayer('yellow', 2);
    applyElement('yellow', {
      elementId: 'yellow-el',
      element: Panel,
      props: { label: 'YELLOW', color: 'yellow', top: 4, left: 16 },
    });
    openLayer('blue', 3);
    applyElement('blue', {
      elementId: 'blue-el',
      element: Panel,
      props: { label: 'BLUE', color: 'blue', top: 6, left: 30 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raiseRed = boundKeyboard(['r'], () => bringLayerToFront('red'));
    const raiseYellow = boundKeyboard(['y'], () =>
      bringLayerToFront('yellow'),
    );
    const raiseBlue = boundKeyboard(['b'], () => bringLayerToFront('blue'));
    const openModal = boundKeyboard(['m'], () => {
      openModalLayer('m', 100);
      applyElementToModalLayer('m', { elementId: 'm-el', element: ModalPanel });
    });
    const quit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      raiseRed();
      raiseYellow();
      raiseBlue();
      openModal();
      quit();
    };
  }, [
    applyElementToModalLayer,
    boundKeyboard,
    bringLayerToFront,
    openModalLayer,
  ]);

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      width="100%"
      height="100%"
      backgroundColor="black"
    >
      <Text bold underline>
        Bring-To-Front Demo
      </Text>
      <Text dimColor>click / drag a panel · r/y/b raise · x topmost key · m modal · q quit</Text>
      <Text>
        layer order:{' '}
        {allLayers.map((l) => `${l.layerId}(${l.zIndex})`).join(' > ') ||
          '(none)'}
      </Text>
      <Text>
        modals: {allModalLayers.map((l) => l.layerId).join(', ') || '(none)'}
      </Text>
    </Box>
  );
}
registerComponent(MainScreen, {});

function App() {
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
