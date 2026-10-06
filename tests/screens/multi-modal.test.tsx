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

interface MultiModalRenderResult {
  lastFrame: () => string | undefined;
  stdin: { write: (data: string) => void };
  unmount: () => void;
}

function renderMultiModalApp(
  defaultScreen: React.ComponentType<any>,
  setup?: (
    kb: ReturnType<typeof useKeyboard>,
    sc: ReturnType<typeof useScreenSystem>,
  ) => (() => void) | void,
): MultiModalRenderResult {
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
      <KeyboardProvider autoTab={true}>
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

describe('multi-modal keyboard integration', () => {
  describe('active modal priority', () => {
    it('only the highest-zIndex modal receives key events', async () => {
      const modalA = createModal('ModalA', { x: vi.fn(), y: vi.fn() });
      const modalB = createModal('ModalB', { x: vi.fn(), z: vi.fn() });

      const { stdin } = renderMultiModalApp(MainScreen, (_kb, sc) => {
        sc.openModalLayer('A', 1);
        sc.applyElementToModalLayer('A', { elementId: 'A-el', element: modalA.Component });
        sc.openModalLayer('B', 2);
        sc.applyElementToModalLayer('B', { elementId: 'B-el', element: modalB.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(modalB.handlers['x']).toHaveBeenCalledTimes(1);
      expect(modalA.handlers['x']).not.toHaveBeenCalled();

      await pressKey(stdin, 'z');
      expect(modalB.handlers['z']).toHaveBeenCalledTimes(1);

      await pressKey(stdin, 'y');
      expect(modalA.handlers['y']).not.toHaveBeenCalled();
    });

    it('closing the active modal activates the next-highest modal', async () => {
      const modalA = createModal('ModalA', { x: vi.fn() });
      const modalB = createModal('ModalB', { x: vi.fn() });

      const { stdin } = renderMultiModalApp(MainScreen, (_kb, sc) => {
        sc.openModalLayer('A', 1);
        sc.applyElementToModalLayer('A', { elementId: 'A-el', element: modalA.Component });
        sc.openModalLayer('B', 2);
        sc.applyElementToModalLayer('B', { elementId: 'B-el', element: modalB.Component });
        sc.closeModalLayer('B');
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(modalA.handlers['x']).toHaveBeenCalledTimes(1);
      expect(modalB.handlers['x']).not.toHaveBeenCalled();
    });
  });

  describe('allowModal pass-through with multiple modals', () => {
    it('allowModal on the active modal passes keys through to screens', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      // allowModal must be called inside the modal component.
      // Pass it via createModal's third argument (setup).
      const modalB = createModal('ModalB', { z: vi.fn() }, (kb) => {
        return kb.allowModal(['x']);
      });

      const { stdin } = renderMultiModalApp(ScreenWithKey, (_kb, sc) => {
        sc.openModalLayer('B', 1);
        sc.applyElementToModalLayer('B', { elementId: 'B-el', element: modalB.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(screenX).toHaveBeenCalledTimes(1);
    });

    it('allowModal on a background modal has no effect', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      // Background modal calls allowModal → should be ignored
      const modalA = createModal('ModalA', { a: vi.fn() }, (kb) => {
        return kb.allowModal(['x']);
      });
      // Active modal has no allowModal → blocks everything
      const modalB = createModal('ModalB', { z: vi.fn() });

      const { stdin } = renderMultiModalApp(ScreenWithKey, (_kb, sc) => {
        sc.openModalLayer('A', 1);
        sc.applyElementToModalLayer('A', { elementId: 'A-el', element: modalA.Component });
        sc.openModalLayer('B', 2);
        sc.applyElementToModalLayer('B', { elementId: 'B-el', element: modalB.Component });
      });
      await flush();

      await pressKey(stdin, 'x');
      expect(screenX).not.toHaveBeenCalled();
    });

    it('allowModal with focusId passes through only when that focus target is active', async () => {
      const screenX = vi.fn();

      function ScreenWithKey() {
        const kb = useKeyboard();
        useEffect(() => kb.boundKeyboard(['x'], screenX), [kb.boundKeyboard]);
        return <Text>ScreenWithKey</Text>;
      }
      ScreenWithKey.displayName = 'ScreenWithKey';
      registerComponent(ScreenWithKey, {});

      function ModalWithFocus() {
        const kb = useKeyboard();
        useEffect(() => {
          kb.boundKeyboard(['tab'], vi.fn(), { focusId: 'fa' });
          kb.boundKeyboard(['x'], vi.fn(), { focusId: 'fb' });
          kb.focusSet('fa');
          return kb.allowModal(['x'], { focusId: 'fa' });
        }, []);
        return <Text>ModalWithFocus</Text>;
      }
      ModalWithFocus.displayName = 'ModalWithFocus';
      registerComponent(ModalWithFocus, {});

      const { stdin } = renderMultiModalApp(ScreenWithKey, (_kb, sc) => {
        sc.openModalLayer('M', 1);
        sc.applyElementToModalLayer('M', { elementId: 'M-el', element: ModalWithFocus });
      });
      await flush();
      await flush();

      // 'fa' is active, allowModal scoped to 'fa' → 'x' passes through
      await pressKey(stdin, 'x');
      expect(screenX).toHaveBeenCalledTimes(1);

      // Switch focus to 'fb' — allowModal no longer applies → 'x' blocked
      await pressKey(stdin, '\t');
      screenX.mockClear();

      await pressKey(stdin, 'x');
      expect(screenX).not.toHaveBeenCalled();
    });
  });

  describe('useModalMissListener with multiple modals', () => {
    it('miss callback only fires on the active modal', async () => {
      const missA = vi.fn();
      const missB = vi.fn();

      function ModalA() {
        const kb = useKeyboard();
        useEffect(() => {
          kb.useModalMissListener(missA);
        }, []);
        return <Text>ModalA</Text>;
      }
      ModalA.displayName = 'ModalA';
      registerComponent(ModalA, {});

      function ModalB() {
        const kb = useKeyboard();
        useEffect(() => {
          kb.useModalMissListener(missB);
        }, []);
        return <Text>ModalB</Text>;
      }
      ModalB.displayName = 'ModalB';
      registerComponent(ModalB, {});

      const { stdin } = renderMultiModalApp(MainScreen, (_kb, sc) => {
        sc.openModalLayer('A', 1);
        sc.applyElementToModalLayer('A', { elementId: 'A-el', element: ModalA });
        sc.openModalLayer('B', 2);
        sc.applyElementToModalLayer('B', { elementId: 'B-el', element: ModalB });
      });
      await flush();
      await flush();

      await pressKey(stdin, 'x');
      expect(missB).toHaveBeenCalledTimes(1);
      expect(missA).not.toHaveBeenCalled();
    });
  });
});

