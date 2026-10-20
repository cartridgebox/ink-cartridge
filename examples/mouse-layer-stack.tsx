/**
 * Mouse Layer Stack Demo — verify mouse hit-testing across stacked layers.
 *
 * A Page box (root region) and a Layer A box (opened via `openLayer`)
 * overlap in the middle. Hit priority is modal > layer > root, first hit
 * wins — so clicks in the overlap register only on the Layer A box, while
 * clicks on the non-overlapping Page area still reach the Page box.
 *
 * The layer element receives props through `applyElement(…, { props })` —
 * type-checked against the element component's own prop type, same as
 * `skip()`'s `params`.
 *
 * Controls:
 *   a — open layer-a (z=10, overlaps the page box)
 *   c — close layer-a
 *   q — quit
 *
 * Run:
 *   npx tsx examples/mouse-layer-stack.tsx
 */
import React, { useContext, useEffect, useState } from 'react';
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
} from '../src/index.js';

const BOX_W = 16;
const BOX_H = 10;

function BoxBody({
  title,
  color,
  clicks,
  hovered,
  last,
}: {
  title: string;
  color: string;
  clicks: number;
  hovered: boolean;
  last: string | null;
}) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={color}>
        {title}
      </Text>
      <Text>clicks: {clicks}</Text>
      <Text color={hovered ? 'green' : 'gray'}>hover: {hovered ? 'yes' : 'no'}</Text>
      {last && <Text dimColor>last: {last}</Text>}
    </Box>
  );
}

function LayerABox({ title, color }: { title: string; color: string }) {
  const ctx = useContext(LayerElementContext);
  const [clicks, setClicks] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  // Inside a layer element: useMouseRegion picks up layer-a + this element id.
  const ref = useMouseRegion({
    onClick: (event) => {
      setClicks((n) => n + 1);
      setLast(`(${event.x},${event.y}) ${event.button}`);
    },
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  return (
    <Box
      position="absolute"
      top={5}
      left={5}
      width={BOX_W}
      height={BOX_H}
      borderStyle="round"
      borderColor={hovered ? 'green' : color}
      ref={ref}
    >
      <BoxBody title={title} color={color} clicks={clicks} hovered={hovered} last={last} />
    </Box>
  );
}

function LayerStackScreen() {
  const { openLayer, applyElement, closeLayer, allLayers } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  const [pageClicks, setPageClicks] = useState(0);
  const [pageHovered, setPageHovered] = useState(false);
  const [pageLast, setPageLast] = useState<string | null>(null);

  // Outside any layer: useMouseRegion registers on the root layer (page).
  const pageRef = useMouseRegion({
    onClick: (event) => {
      setPageClicks((n) => n + 1);
      setPageLast(`(${event.x},${event.y}) ${event.button}`);
    },
    onEnter: () => setPageHovered(true),
    onLeave: () => setPageHovered(false),
  });

  const hasLayerA = allLayers.some((l) => l.layerId === 'layer-a');

  useEffect(() => {
    const openA = boundKeyboard(['a'], () => {
      if (allLayers.some((l) => l.layerId === 'layer-a')) return;
      openLayer('layer-a', 10);
      // props is type-checked against LayerABox's props ({ title, color }).
      applyElement('layer-a', {
        elementId: 'a1',
        element: LayerABox,
        props: { title: 'Layer A Box', color: 'cyan' },
      });
    });
    const closeA = boundKeyboard(['c'], () => closeLayer('layer-a'));
    const quit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      openA();
      closeA();
      quit();
    };
  }, [allLayers, applyElement, boundKeyboard, closeLayer, openLayer]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Mouse Layer Stack Demo</Text>
      <Text dimColor>Overlap: layer beats page · a open · c close · q quit</Text>
      <Text color={hasLayerA ? 'cyan' : 'gray'}>
        Layer A: {hasLayerA ? 'open (z=10, on top)' : 'closed'}
      </Text>

      {/* Page box — overlaps the layer box when layer-a is open */}
      <Box
        position="absolute"
        top={2}
        left={2}
        width={BOX_W}
        height={BOX_H}
        borderStyle="round"
        borderColor={pageHovered ? 'green' : 'yellow'}
        ref={pageRef}
      >
        <BoxBody title="Page Box" color="yellow" clicks={pageClicks} hovered={pageHovered} last={pageLast} />
      </Box>
    </Box>
  );
}
registerComponent(LayerStackScreen, {});

function App() {
  return <CurrentScreen />;
}
registerComponent(App, {});

render(
  <ScenarioManagementProvider defaultScreen={LayerStackScreen} fullScreen>
    <KeyboardProvider mouse>
      <App />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
