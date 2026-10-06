import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import React, { act, useEffect } from 'react';
import { Box, Text } from 'ink';
import { render } from 'ink-testing-library';
import {
  registerComponent,
  clearRegistry,
} from '../../src/screen/registry.js';
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from '../../src/screen/provider.js';
import { CurrentScreen } from '../../src/screen/current-screen.js';
import { KeyboardProvider } from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';
import { useScreenSystem } from '../../src/screen/hook.js';

/**
 * Raise/restore keyboard-ownership round-trip tests.
 *
 * `bringLayerToFront` and `restoreLayerZIndex` both reorder `allLayers`,
 * which re-renders `CurrentScreen`, swaps every element's
 * `LayerElementContext` value, and forces every element's binding effect to
 * re-run (see owner-rebind.test.tsx for the underlying rebind bug). These
 * tests pin that keyboard ownership follows the CURRENT layer order across
 * the full round trip — raise switches the key to the raised layer, restore
 * switches it back, and no element's bindings ever leave its own layer.
 */

const lowKey = vi.fn();
const highKey = vi.fn();
const thirdKey = vi.fn();

let currentUnmount: (() => void) | null = null;

function LowEl() {
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(['x'], lowKey);
  }, [boundKeyboard]);

  return (
    <Box position="absolute" top={2}>
      <Text>LowEl</Text>
    </Box>
  );
}

function HighEl() {
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(['x'], highKey);
  }, [boundKeyboard]);

  return (
    <Box position="absolute" top={4}>
      <Text>HighEl</Text>
    </Box>
  );
}

function ThirdEl() {
  // The binding plus the hook call: useKeyboard pushes "third" onto the
  // owner stack, so re-binds of the OTHER elements land on this stack top
  // when the withOwner fix is disabled — exactly what these tests catch.
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(['x'], thirdKey);
  }, [boundKeyboard]);

  return (
    <Box position="absolute" top={6}>
      <Text>ThirdEl</Text>
    </Box>
  );
}

function Main() {
  const {
    openLayer,
    applyElement,
    closeLayer,
    bringLayerToFront,
    restoreLayerZIndex,
  } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  // Open the base layers exactly once on mount — re-running this on later
  // renders would resurrect layers the test just closed.
  useEffect(() => {
    openLayer('low', 1);
    applyElement('low', { elementId: 'low-el', element: LowEl });
    openLayer('high', 2);
    applyElement('high', { elementId: 'high-el', element: HighEl });
    openLayer('third', 3);
    applyElement('third', { elementId: 'third-el', element: ThirdEl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raiseLow = boundKeyboard(['r'], () => bringLayerToFront('low'));
    const restoreLow = boundKeyboard(['u'], () =>
      restoreLayerZIndex('low'),
    );
    const closeOthers = boundKeyboard(['c'], () => {
      closeLayer('high');
      closeLayer('third');
    });
    return () => {
      raiseLow();
      restoreLow();
      closeOthers();
    };
  }, [boundKeyboard, bringLayerToFront, restoreLayerZIndex, closeLayer]);

  return <Text>Main</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

async function press(
  stdin: { write: (data: string) => void },
  key: string,
): Promise<void> {
  await act(async () => {
    stdin.write(key);
  });
  await flush();
}

function renderApp() {
  const app = render(
    <ScenarioManagementProvider defaultScreen={Main} fullScreen>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  currentUnmount = () => app.unmount();
  return app;
}

beforeEach(() => {
  clearRegistry();
  clearDispatchers();
  lowKey.mockClear();
  highKey.mockClear();
  thirdKey.mockClear();
  registerComponent(Main, {});
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
  clearDispatchers();
});

describe('raise/restore keyboard ownership', () => {
  it('keeps keyboard ownership correct across a raise/restore round trip', async () => {
    const { stdin } = renderApp();
    await flush();

    // The third layer owns 'x' while on top.
    await press(stdin, 'x');
    expect(thirdKey).toHaveBeenCalledTimes(1);

    // Raise the low layer — the raised layer takes over 'x'.
    await press(stdin, 'r');
    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(1);
    expect(thirdKey).toHaveBeenCalledTimes(1);

    // Restore it — the reorder re-binds every element again, and the third
    // layer must take 'x' back.
    await press(stdin, 'u');
    await press(stdin, 'x');
    expect(thirdKey).toHaveBeenCalledTimes(2);
    expect(lowKey).toHaveBeenCalledTimes(1);

    // The bindings never left their own elements: with everything above the
    // low layer closed, the low layer still answers.
    await press(stdin, 'c');
    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(2);
    expect(thirdKey).toHaveBeenCalledTimes(2);
  });

  it('survives multiple round trips without leaking bindings', async () => {
    const { stdin } = renderApp();
    await flush();

    await press(stdin, 'x');
    expect(thirdKey).toHaveBeenCalledTimes(1);

    await press(stdin, 'r');
    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(1);

    await press(stdin, 'u');
    await press(stdin, 'x');
    expect(thirdKey).toHaveBeenCalledTimes(2);

    await press(stdin, 'r');
    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(2);

    await press(stdin, 'u');
    await press(stdin, 'x');
    expect(thirdKey).toHaveBeenCalledTimes(3);
    expect(lowKey).toHaveBeenCalledTimes(2);
  });
});
