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
 * Owner-stack rebind regression tests.
 *
 * `useKeyboard` registers bindings through the engine's owner stack: each
 * layer element pushes its own layer id on mount. The stack top therefore
 * belongs to the LAST mounted sibling element, not to the element that is
 * currently re-binding. Any state change that re-renders `CurrentScreen`
 * (e.g. another layer mounting) swaps every element's `LayerElementContext`
 * value, which changes the `boundKeyboard` identity and forces every
 * element's binding effect to re-run — and a re-run registered against the
 * wrong stack top silently moved the binding onto a sibling's layer (or,
 * worse, lazily created an element keyboard for this elementId under a
 * DIFFERENT layer, which the layer processor never visits).
 *
 * The fix wraps every owner-sensitive call in a temporary push of the
 * caller's own owner, so re-binding always lands on its own layer regardless
 * of the stack. These tests pin that behavior without depending on the
 * clickOnRise feature: a third layer mounting is the rebind trigger.
 *
 * Observable consequence of the bug: after the rebind, pressing 'x' fires
 * nothing (the binding moved under the third layer's inactive elementId),
 * and after closing the other layers the low layer is completely mute.
 */

const lowKey = vi.fn();
const highKey = vi.fn();
const lowFocusKey = vi.fn();

let currentUnmount: (() => void) | null = null;

function LowEl() {
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const unbindX = boundKeyboard(['x'], lowKey);
    const unbindF = boundKeyboard(['f'], lowFocusKey, { focusId: 'lf' });
    return () => {
      unbindX();
      unbindF();
    };
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
    const unbindX = boundKeyboard(['x'], highKey);
    const unbindF = boundKeyboard(['f'], highKey);
    return () => {
      unbindX();
      unbindF();
    };
  }, [boundKeyboard]);

  return (
    <Box position="absolute" top={4}>
      <Text>HighEl</Text>
    </Box>
  );
}

/** Mounts last, owns the stack top — and carries no bindings itself. */
function ThirdEl() {
  // No bindings, but the hook call pushes "third" onto the owner stack — the
  // rebind of the OTHER elements then lands on this stack top when the fix
  // is disabled, which is exactly what these tests must catch.
  useKeyboard();
  return (
    <Box position="absolute" top={6}>
      <Text>ThirdEl</Text>
    </Box>
  );
}

/** A second trigger layer: its mount is the state change that re-binds the
 *  low/high elements while "third" (not the elements themselves) sits on
 *  top of the owner stack. */
function FourthEl() {
  useKeyboard();
  return (
    <Box position="absolute" top={8}>
      <Text>FourthEl</Text>
    </Box>
  );
}

function ModalEl() {
  const { boundKeyboard } = useKeyboard();
  const { closeModalLayer, openLayer, applyElement } = useScreenSystem();

  useEffect(() => {
    const closeModal = boundKeyboard(['q'], () => closeModalLayer('m'));
    // The modal itself opens the third layer: the key must not rely on
    // page-level bindings, which the modal barrier would swallow.
    const openThird = boundKeyboard(['t'], () => {
      openLayer('third', 3);
      applyElement('third', { elementId: 'third-el', element: ThirdEl });
    });
    return () => {
      closeModal();
      openThird();
    };
  }, [applyElement, boundKeyboard, closeModalLayer, openLayer]);

  return <Text>ModalEl</Text>;
}

function Main() {
  const {
    openLayer,
    applyElement,
    closeLayer,
    openModalLayer,
    applyElementToModalLayer,
    allLayers,
  } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  // Open the base layers exactly once on mount — re-running this on later
  // renders would resurrect layers the test just closed (the binding effect
  // below re-runs whenever the screen system state changes).
  useEffect(() => {
    openLayer('low', 1);
    applyElement('low', { elementId: 'low-el', element: LowEl });
    openLayer('high', 2);
    applyElement('high', { elementId: 'high-el', element: HighEl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const openThird = boundKeyboard(['o'], () => {
      openLayer('third', 3);
      applyElement('third', { elementId: 'third-el', element: ThirdEl });
    });
    // The second state change re-binds the low/high elements while "third"
    // (not they themselves) is on top of the owner stack.
    const openFourth = boundKeyboard(['w'], () => {
      openLayer('fourth', 4);
      applyElement('fourth', { elementId: 'fourth-el', element: FourthEl });
    });
    const closeHighAndThird = boundKeyboard(['c'], () => {
      closeLayer('high');
      closeLayer('third');
      closeLayer('fourth');
    });
    const openModal = boundKeyboard(['m'], () => {
      openModalLayer('m', 100);
      applyElementToModalLayer('m', { elementId: 'm-el', element: ModalEl });
    });
    return () => {
      openThird();
      openFourth();
      closeHighAndThird();
      openModal();
    };
  }, [
    applyElement,
    applyElementToModalLayer,
    boundKeyboard,
    closeLayer,
    openLayer,
    openModalLayer,
  ]);

  return <Text>Main layers:{allLayers.map((l) => l.layerId).join(",")}</Text>;
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
  lowFocusKey.mockClear();
  registerComponent(Main, {});
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
  clearDispatchers();
});

describe('owner-stack rebind ownership', () => {
  it('keeps every element binding on its own layer after a sibling layer mounts', async () => {
    const { stdin, lastFrame } = renderApp();
    await flush();

    await press(stdin, 'x');
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowKey).not.toHaveBeenCalled();

    // The third layer mounts and re-binds every element once (its own
    // push effect runs after the rebind). The FOURTH layer then re-binds
    // them again while "third" sits on top of the owner stack — the exact
    // moment the bug used to move the high element's binding away.
    await press(stdin, 'o');
    await press(stdin, 'w');
    await press(stdin, 'x');
    expect(highKey).toHaveBeenCalledTimes(2);
    expect(lowKey).not.toHaveBeenCalled();

    // Close everything above the low layer — its binding must have stayed
    // on ITS OWN element, not leaked onto the layers that just closed.
    await press(stdin, 'c');
    expect(lastFrame()).toContain('LowEl');
    expect(lastFrame()).not.toContain('HighEl');
    expect(lastFrame()).not.toContain('ThirdEl');
    expect(lastFrame()).not.toContain('FourthEl');
    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(1);
    expect(highKey).toHaveBeenCalledTimes(2);
  });

  it('keeps regular-layer bindings when rebinding while a modal owns the stack top', async () => {
    const { stdin } = renderApp();
    await flush();

    await press(stdin, 'm');
    await flush();

    // The modal mounts the third layer: the rebind now happens while the
    // modal (and then the third layer) sit on top of the owner stack.
    await press(stdin, 't');
    await flush();

    await press(stdin, 'q');
    await flush();

    // Modal closed: the third layer is top but carries no bindings — the
    // high layer must still own 'x' after the rebind above.
    await press(stdin, 'x');
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowKey).not.toHaveBeenCalled();

    await press(stdin, 'c');
    await flush();

    await press(stdin, 'x');
    expect(lowKey).toHaveBeenCalledTimes(1);
    expect(highKey).toHaveBeenCalledTimes(1);
  });

  it('keeps focus-scoped bindings on their own element after a rebind', async () => {
    const { stdin } = renderApp();
    await flush();

    await press(stdin, 'f');
    expect(highKey).toHaveBeenCalledTimes(1);

    await press(stdin, 'o');
    await press(stdin, 'w');
    await press(stdin, 'f');
    expect(highKey).toHaveBeenCalledTimes(2);
    expect(lowFocusKey).not.toHaveBeenCalled();

    await press(stdin, 'c');
    await press(stdin, 'f');
    expect(lowFocusKey).toHaveBeenCalledTimes(1);
  });
});
