import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { act } from 'react';

import { registerComponent, clearRegistry } from '../../src/screen/registry.js';
import { ScenarioManagementProvider, clearDispatchers } from '../../src/screen/provider.js';
import { CurrentScreen } from '../../src/screen/current-screen.js';
import { useScreenSystem } from '../../src/screen/hook.js';
import { KeyboardProvider } from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

async function pressKey(stdin: { write: (data: string) => void }, key: string): Promise<void> {
  await act(async () => {
    stdin.write(key);
  });
}

function MainScreen() {
  return <Text>MainScreen</Text>;
}
MainScreen.displayName = 'MainScreen';

function createOverlay(
  displayName: string,
  bindings: Record<string, () => void>,
  setup?: (kb: ReturnType<typeof useKeyboard>) => (() => void) | void,
) {
  const handlers = { ...bindings };

  function Overlay() {
    const kb = useKeyboard();
    useEffect(() => {
      const cleanups: (() => void)[] = [];
      for (const [key, handler] of Object.entries(handlers)) {
        cleanups.push(kb.boundKeyboard([key], handler));
      }
      if (setup) {
        const teardown = setup(kb);
        if (teardown) cleanups.push(teardown);
      }
      return () => cleanups.forEach((c) => c());
    }, [kb.boundKeyboard]);
    return <Text>{displayName}</Text>;
  }
  Overlay.displayName = displayName;
  registerComponent(Overlay, {});

  return { Component: Overlay, handlers };
}

function createModal(
  displayName: string,
  bindings: Record<string, () => void>,
  setup?: (kb: ReturnType<typeof useKeyboard>) => (() => void) | void,
) {
  const handlers = { ...bindings };

  function Modal() {
    const kb = useKeyboard();
    useEffect(() => {
      const cleanups: (() => void)[] = [];
      for (const [key, handler] of Object.entries(handlers)) {
        cleanups.push(kb.boundKeyboard([key], handler));
      }
      if (setup) {
        const teardown = setup(kb);
        if (teardown) cleanups.push(teardown);
      }
      return () => cleanups.forEach((c) => c());
    }, [kb.boundKeyboard]);
    return <Text>{displayName}</Text>;
  }
  Modal.displayName = displayName;
  registerComponent(Modal, {});

  return { Component: Modal, handlers };
}

interface MultiOverlayRenderResult {
  lastFrame: () => string | undefined;
  stdin: { write: (data: string) => void };
  unmount: () => void;
}

function renderMultiOverlayApp(
  defaultScreen: React.ComponentType<any>,
  setup?: (
    kb: ReturnType<typeof useKeyboard>,
    sc: ReturnType<typeof useScreenSystem>,
  ) => (() => void) | void,
): MultiOverlayRenderResult {
  function AppHost() {
    const kb = useKeyboard();
    const sc = useScreenSystem();

    useEffect(() => {
      if (setup) {
        const cleanup = setup(kb, sc);
        return cleanup ?? undefined;
      }
      return;
    }, []);

    return <CurrentScreen />;
  }
  AppHost.displayName = 'AppHost';

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider defaultScreen={defaultScreen}>
      <KeyboardProvider>
        <AppHost />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );

  return { lastFrame: () => lastFrame(), stdin, unmount };
}

beforeEach(() => {
  clearRegistry();
  registerComponent(MainScreen, {});
});

afterEach(() => {
  clearDispatchers();
  vi.restoreAllMocks();
});

function sameLayer(
  sc: ReturnType<typeof useScreenSystem>,
  elements: { id: string; element: React.ComponentType<any> }[],
) {
  sc.openLayer('L', 1);
  for (const entry of elements) {
    sc.applyElement('L', { elementId: entry.id, element: entry.element });
  }
}

describe('multi-layer keyboard integration', () => {
  describe('broadcast within a layer', () => {
    it('all active elements in the same layer receive the same key', async () => {
      const ovlA = createOverlay('OvlA', { x: vi.fn() });
      const ovlB = createOverlay('OvlB', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sameLayer(sc, [
          { id: 'A-el', element: ovlA.Component },
          { id: 'B-el', element: ovlB.Component },
        ]);
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlA.handlers['x']).toHaveBeenCalledTimes(1);
      expect(ovlB.handlers['x']).toHaveBeenCalledTimes(1);
    });

    it('one element consuming a key does not prevent other elements in the same layer', async () => {
      const ovlA = createOverlay('OvlA', { x: vi.fn() });
      const ovlB = createOverlay('OvlB', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sameLayer(sc, [
          { id: 'A-el', element: ovlA.Component },
          { id: 'B-el', element: ovlB.Component },
        ]);
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlA.handlers['x']).toHaveBeenCalledTimes(1);
      expect(ovlB.handlers['x']).toHaveBeenCalledTimes(1);
    });
  });

  describe('layer priority', () => {
    it('the top layer handles a key before lower layers', async () => {
      const ovlA = createOverlay('OvlA', { x: vi.fn() });
      const ovlB = createOverlay('OvlB', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovlA.Component });
        sc.openLayer('B', 2);
        sc.applyElement('B', { elementId: 'B-el', element: ovlB.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlB.handlers['x']).toHaveBeenCalledTimes(1);
      expect(ovlA.handlers['x']).not.toHaveBeenCalled();
    });

    it('an unmatched key bubbles to the next lower layer', async () => {
      const ovlA = createOverlay('OvlA', { y: vi.fn() });
      const ovlB = createOverlay('OvlB', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovlA.Component });
        sc.openLayer('B', 2);
        sc.applyElement('B', { elementId: 'B-el', element: ovlB.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlA.handlers['y']).not.toHaveBeenCalled();
      expect(ovlB.handlers['x']).toHaveBeenCalledTimes(1);
    });
  });

  describe('screen blocking', () => {
    it('a layer element consuming a key blocks the screen', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      const ovl = createOverlay('Ovl', { x: vi.fn() });
      const { stdin } = renderMultiOverlayApp(ScreenWithKey, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovl.handlers['x']).toHaveBeenCalledTimes(1);
      expect(screenX).not.toHaveBeenCalled();
    });

    it('the screen fires when no layer handles the key', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      const ovl = createOverlay('Ovl', { y: vi.fn() });
      const { stdin } = renderMultiOverlayApp(ScreenWithKey, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(screenX).toHaveBeenCalledTimes(1);
      expect(ovl.handlers['y']).not.toHaveBeenCalled();
    });
  });

  describe('penetration', () => {
    it('a penetrated key reaches the screen', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      const ovl = createOverlay('Ovl', { x: vi.fn() }, (kb) => kb.penetration(['x']));
      const { stdin } = renderMultiOverlayApp(ScreenWithKey, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(screenX).toHaveBeenCalledTimes(1);
      expect(ovl.handlers['x']).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('a stopped key blocks the screen even without a binding', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      const ovl = createOverlay('Ovl', {}, (kb) => kb.stop(['x']));
      const { stdin } = renderMultiOverlayApp(ScreenWithKey, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(screenX).not.toHaveBeenCalled();
    });

    it('stop on one element does not block another element in the same layer', async () => {
      const ovlTop = createOverlay('OvlTop', {}, (kb) => kb.stop(['x']));
      const ovlBottom = createOverlay('OvlBottom', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sameLayer(sc, [
          { id: 'top-el', element: ovlTop.Component },
          { id: 'bottom-el', element: ovlBottom.Component },
        ]);
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlBottom.handlers['x']).toHaveBeenCalledTimes(1);
    });
  });

  describe('modal × layer', () => {
    it('an active modal prevents layers from receiving keys', async () => {
      const modal = createModal('Modal', { a: vi.fn() });
      const ovl = createOverlay('Ovl', { x: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
        sc.openModalLayer('M', 2);
        sc.applyElementToModalLayer('M', { elementId: 'M-el', element: modal.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovl.handlers['x']).not.toHaveBeenCalled();
    });
  });

  describe('onlyThis', () => {
    it('a stopsWorkingAfterLayerAppearing binding fires when no layer is open', async () => {
      const handler = vi.fn();

      function Solo() {
        const kb = useKeyboard();
        useEffect(
          () => kb.boundKeyboard(['x'], handler, { stopsWorkingAfterLayerAppearing: true }),
          [kb.boundKeyboard],
        );
        return <Text>Solo</Text>;
      }
      Solo.displayName = 'Solo';
      registerComponent(Solo, {});

      const { stdin } = renderMultiOverlayApp(Solo);
      await flush();

      await pressKey(stdin, 'x');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('a stopsWorkingAfterLayerAppearing binding does not fire while a layer is active', async () => {
      const handler = vi.fn();

      function Solo() {
        const kb = useKeyboard();
        useEffect(
          () => kb.boundKeyboard(['x'], handler, { stopsWorkingAfterLayerAppearing: true }),
          [kb.boundKeyboard],
        );
        return <Text>Solo</Text>;
      }
      Solo.displayName = 'Solo';
      registerComponent(Solo, {});

      const ovlOther = createOverlay('OvlOther', { y: vi.fn() });
      const { stdin } = renderMultiOverlayApp(Solo, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovlOther.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('globalKeys × layer', () => {
    it('a layer binding overrides a global key when affectLayer is true', async () => {
      const globalH = vi.fn();
      const ovlH = vi.fn();
      const ovl = createOverlay('Ovl', { x: ovlH });

      const { stdin } = renderMultiOverlayApp(MainScreen, (kb, sc) => {
        kb.globalKeys([{ key: 'x', operate: globalH, affectLayer: true }]);
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlH).toHaveBeenCalledTimes(1);
      expect(globalH).not.toHaveBeenCalled();
    });

    it('affectLayer true with no matching layer binding lets the global key fire', async () => {
      const globalH = vi.fn();
      const ovl = createOverlay('Ovl', { y: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (kb, sc) => {
        kb.globalKeys([{ key: 'x', operate: globalH, affectLayer: true }]);
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(globalH).toHaveBeenCalledTimes(1);
      expect(ovl.handlers['y']).not.toHaveBeenCalled();
    });

    it('affectLayer false fires the global key after the layer binding', async () => {
      const globalH = vi.fn();
      const ovlH = vi.fn();
      const ovl = createOverlay('Ovl', { x: ovlH });

      const { stdin } = renderMultiOverlayApp(MainScreen, (kb, sc) => {
        kb.globalKeys([{ key: 'x', operate: globalH }]);
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovl.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlH).toHaveBeenCalledTimes(1);
      expect(globalH).not.toHaveBeenCalled();
    });
  });

  describe('focus system across layers', () => {
    it('each layer element keeps independent focus targets', async () => {
      const focusA = vi.fn();
      const focusB = vi.fn();

      function OverlayA() {
        const kb = useKeyboard();
        useEffect(() => {
          const unbind = kb.boundKeyboard(['x'], focusA, { focusId: 'fa' });
          kb.focusSet('fa');
          return unbind;
        }, [kb.boundKeyboard]);
        return <Text>OverlayA</Text>;
      }
      OverlayA.displayName = 'OverlayA';
      registerComponent(OverlayA, {});

      function OverlayB() {
        const kb = useKeyboard();
        useEffect(() => {
          const unbind = kb.boundKeyboard(['x'], focusB, { focusId: 'fb' });
          kb.focusSet('fb');
          return unbind;
        }, [kb.boundKeyboard]);
        return <Text>OverlayB</Text>;
      }
      OverlayB.displayName = 'OverlayB';
      registerComponent(OverlayB, {});

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sameLayer(sc, [
          { id: 'A-el', element: OverlayA },
          { id: 'B-el', element: OverlayB },
        ]);
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(focusA).toHaveBeenCalledTimes(1);
      expect(focusB).toHaveBeenCalledTimes(1);
    });
  });

  describe('dynamic layers', () => {
    it('an element applied mid-session joins the active layer', async () => {
      const ovlA = createOverlay('OvlA', { x: vi.fn() });
      const ovlB = createOverlay('OvlB', { x: vi.fn() });

      function DynamicScreen() {
        const kb = useKeyboard();
        const sc = useScreenSystem();
        useEffect(() => {
          const openA = kb.boundKeyboard(['o'], () => {
            sc.openLayer('L', 1);
            sc.applyElement('L', { elementId: 'A-el', element: ovlA.Component });
          });
          const openB = kb.boundKeyboard(['p'], () => {
            sc.applyElement('L', { elementId: 'B-el', element: ovlB.Component });
          });
          return () => {
            openA();
            openB();
          };
        }, []);
        return <Text>Dynamic</Text>;
      }
      DynamicScreen.displayName = 'DynamicScreen';
      registerComponent(DynamicScreen, {});

      const { stdin } = renderMultiOverlayApp(DynamicScreen);
      await flush();
      await pressKey(stdin, 'o');
      await flush();
      await pressKey(stdin, 'p');
      await flush();
      await pressKey(stdin, 'x');
      expect(ovlA.handlers['x']).toHaveBeenCalledTimes(1);
      expect(ovlB.handlers['x']).toHaveBeenCalledTimes(1);
    });

    it('closing one layer leaves the other working', async () => {
      const ovlA = createOverlay('OvlA', { x: vi.fn() });
      const ovlB = createOverlay('OvlB', { y: vi.fn() });

      const { stdin } = renderMultiOverlayApp(MainScreen, (_kb, sc) => {
        sc.openLayer('A', 1);
        sc.applyElement('A', { elementId: 'A-el', element: ovlA.Component });
        sc.openLayer('B', 2);
        sc.applyElement('B', { elementId: 'B-el', element: ovlB.Component });
        sc.closeLayer('B');
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(ovlA.handlers['x']).toHaveBeenCalledTimes(1);
      expect(ovlB.handlers['y']).not.toHaveBeenCalled();
    });
  });
});
