/**
 * Layer System Demo
 *
 * Demonstrates the new layer model:
 * - Layer A (z=10) broadcasts `return` to all active elements.
 * - A `penetration('x')` makes layer A transparent so layer B handles `x`.
 * - A key with no match in A bubbles to layer B; B handles `z`.
 * - B `stop('s')` blocks `s` before it reaches the page.
 * - A modal layer consumes everything by default, allows `t` through,
 *   and closes with escape.
 *
 * Run:
 *   npx tsx examples/layer-system/LayerSystem.tsx
 */
import React, {
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  LayerElementContext,
  ModalLayerElementContext,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useScreenSystem,
} from '../../src/index.js';

function ElementA1() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard, penetration } = useKeyboard();
  const [enterCount, setEnterCount] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    const unbind = boundKeyboard(
      ['return'],
      () => setEnterCount((n) => n + 1),
      { elementId: ctx.id },
    );
    const unpenetrate = penetration(['x'], { elementId: ctx.id });
    return () => {
      unbind();
      unpenetrate();
    };
  }, [boundKeyboard, penetration, ctx]);

  return (
    <Box
      position="absolute"
      top={2}
      left={2}
      width={48}
      height={5}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
      padding={1}
    >
      <Box flexDirection="column">
        <Text bold color="cyan">Layer A · Element A1</Text>
        <Text dimColor>return x{enterCount} · x is penetrated</Text>
      </Box>
    </Box>
  );
}

function ElementA2() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard } = useKeyboard();
  const [enterCount, setEnterCount] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    const unbind = boundKeyboard(
      ['return'],
      () => setEnterCount((n) => n + 1),
      { elementId: ctx.id },
    );
    return unbind;
  }, [boundKeyboard, ctx]);

  return (
    <Box
      position="absolute"
      top={8}
      left={2}
      width={48}
      height={5}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
      padding={1}
    >
      <Box flexDirection="column">
        <Text bold color="cyan">Layer A · Element A2</Text>
        <Text dimColor>return x{enterCount}</Text>
      </Box>
    </Box>
  );
}

function ElementB1() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard, stop } = useKeyboard();
  const [xCount, setXCount] = useState(0);
  const [zCount, setZCount] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    const unbindX = boundKeyboard(
      ['x'],
      () => setXCount((n) => n + 1),
      { elementId: ctx.id },
    );
    const unbindZ = boundKeyboard(
      ['z'],
      () => setZCount((n) => n + 1),
      { elementId: ctx.id },
    );
    const unstop = stop(['s'], { elementId: ctx.id });
    return () => {
      unbindX();
      unbindZ();
      unstop();
    };
  }, [boundKeyboard, stop, ctx]);

  return (
    <Box
      position="absolute"
      top={2}
      left={54}
      width={44}
      height={5}
      borderStyle="round"
      borderColor="yellow"
      backgroundColor="black"
      padding={1}
    >
      <Box flexDirection="column">
        <Text bold color="yellow">Layer B · Element B1</Text>
        <Text dimColor>x x{xCount} · z x{zCount} · s stopped</Text>
      </Box>
    </Box>
  );
}

function ModalElement() {
  const ctx = useContext(ModalLayerElementContext);
  const { boundKeyboard, allowModal } = useKeyboard();
  const { closeModalLayer } = useScreenSystem();
  const [returnCount, setReturnCount] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    const unbindEscape = boundKeyboard(
      ['escape'],
      () => closeModalLayer(ctx.modalLayer.layerId),
      { elementId: ctx.id },
    );
    const unbindReturn = boundKeyboard(
      ['return'],
      () => setReturnCount((n) => n + 1),
      { elementId: ctx.id },
    );
    const unallow = allowModal(['t'], { elementId: ctx.id });
    return () => {
      unbindEscape();
      unbindReturn();
      unallow();
    };
  }, [allowModal, boundKeyboard, closeModalLayer, ctx]);

  return (
    <Box
      position="absolute"
      top={8}
      left={54}
      width={46}
      height={7}
      borderStyle="round"
      borderColor="magenta"
      backgroundColor="black"
      padding={1}
    >
      <Box flexDirection="column">
        <Text bold color="magenta">Modal Layer</Text>
        <Text dimColor>return x{returnCount} · escape closes · t passes through</Text>
      </Box>
    </Box>
  );
}

function LayerDemoScreen() {
  const {
    allLayers,
    allModalLayers,
    openLayer,
    applyElement,
    closeAllLayer,
    openModalLayer,
    applyElementToModalLayer,
    closeAllModalLayer,
  } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [log, setLog] = useState<string[]>([]);

  const stateRef = useRef({ allLayers, allModalLayers });
  stateRef.current = { allLayers, allModalLayers };

  const pushLog = (line: string) => {
    setLog((prev) => [...prev.slice(-7), line]);
  };

  useEffect(() => {
    const openA = boundKeyboard(['a'], () => {
      if (stateRef.current.allLayers.some((l) => l.layerId === 'layer-a')) {
        pushLog('Layer A is already open');
        return;
      }
      openLayer('layer-a', 10);
      applyElement('layer-a', { elementId: 'a1', element: ElementA1 });
      applyElement('layer-a', { elementId: 'a2', element: ElementA2 });
      pushLog('Opened Layer A (z=10)');
    });

    const openB = boundKeyboard(['b'], () => {
      if (stateRef.current.allLayers.some((l) => l.layerId === 'layer-b')) {
        pushLog('Layer B is already open');
        return;
      }
      openLayer('layer-b', 5);
      applyElement('layer-b', { elementId: 'b1', element: ElementB1 });
      pushLog('Opened Layer B (z=5)');
    });

    const openModalKey = boundKeyboard(['m'], () => {
      if (stateRef.current.allModalLayers.some((l) => l.layerId === 'modal-1')) {
        pushLog('Modal is already open');
        return;
      }
      openModalLayer('modal-1', 100);
      applyElementToModalLayer('modal-1', {
        elementId: 'modal-el',
        element: ModalElement,
      });
      pushLog('Opened Modal (z=100)');
    });

    const closeLayers = boundKeyboard(['c'], () => {
      closeAllLayer();
      pushLog('Closed all layers');
    });
    const closeModals = boundKeyboard(['v'], () => {
      closeAllModalLayer();
      pushLog('Closed all modal layers');
    });

    const pageReturn = boundKeyboard(['return'], () => {
      pushLog('Page received return (no layer handled it)');
    });
    const pageS = boundKeyboard(['s'], () => {
      pushLog('Page received s (B stop did not block)');
    });
    const pageT = boundKeyboard(['t'], () => {
      pushLog('Page received t (modal allow pass-through)');
    });
    const quit = boundKeyboard(['q'], () => process.exit(0));

    return () => {
      openA();
      openB();
      openModalKey();
      closeLayers();
      closeModals();
      pageReturn();
      pageS();
      pageT();
      quit();
    };
  }, [
    applyElement,
    applyElementToModalLayer,
    boundKeyboard,
    closeAllLayer,
    closeAllModalLayer,
    openLayer,
    openModalLayer,
  ]);

  const hasA = allLayers.some((l) => l.layerId === 'layer-a');
  const hasB = allLayers.some((l) => l.layerId === 'layer-b');
  const hasModal = allModalLayers.some((l) => l.layerId === 'modal-1');

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>Layer System Demo</Text>
      <Text dimColor>
        A broadcast · bubble to B · penetration · stop · modal barrier
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Status</Text>
        <Text color={hasA ? 'cyan' : 'gray'}>
          Layer A (z=10): {hasA ? 'open' : 'closed'}
        </Text>
        <Text color={hasB ? 'yellow' : 'gray'}>
          Layer B (z=5): {hasB ? 'open' : 'closed'}
        </Text>
        <Text color={hasModal ? 'magenta' : 'gray'}>
          Modal (z=100): {hasModal ? 'open' : 'closed'}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Keys</Text>
        <Text dimColor>a open A · b open B · m open modal</Text>
        <Text dimColor>return A broadcast · x A penetrates → B · z bubbles to B</Text>
        <Text dimColor>s B stops → page blocked · t modal allows → page</Text>
        <Text dimColor>c close layers · v close modals · escape close modal · q quit</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Event log</Text>
        {log.length === 0 ? (
          <Text dimColor>No events yet</Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} color="green">
              {line}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

registerComponent(LayerDemoScreen, {});

render(
  <ScenarioManagementProvider defaultScreen={LayerDemoScreen} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
