import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import React, { act, useContext, useEffect } from 'react';
import { Text } from 'ink';
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
import {
  KeyboardProvider,
} from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';
import { useScreenSystem } from '../../src/screen/hook.js';
import { ModalLayerElementContext } from '../../src/screen/ModalLayerElementContext.js';

const handlers = {
  modalReturn: vi.fn(),
  pageReturn: vi.fn(),
  pageT: vi.fn(),
};

function ModalElement() {
  const ctx = useContext(ModalLayerElementContext);
  const { boundKeyboard, allowModal } = useKeyboard();
  const { closeModalLayer } = useScreenSystem();

  useEffect(() => {
    if (!ctx) return;
    const unbindReturn = boundKeyboard(
      ['return'],
      () => handlers.modalReturn(),
      { elementId: ctx.id },
    );
    const unbindClose = boundKeyboard(
      ['e'],
      () => closeModalLayer(ctx.modalLayer.layerId),
      { elementId: ctx.id },
    );
    const unallow = allowModal(['t'], { elementId: ctx.id });
    return () => {
      unbindReturn();
      unbindClose();
      unallow();
    };
  }, [allowModal, boundKeyboard, closeModalLayer, ctx]);

  return <Text>Modal</Text>;
}

function Demo() {
  const { openModalLayer, applyElementToModalLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const openModal = boundKeyboard(['m'], () => {
      openModalLayer('modal-1', 100);
      applyElementToModalLayer('modal-1', {
        elementId: 'modal-el',
        element: ModalElement,
      });
    });
    const pageReturn = boundKeyboard(['return'], () => handlers.pageReturn());
    const pageT = boundKeyboard(['t'], () => handlers.pageT());

    return () => {
      openModal();
      pageReturn();
      pageT();
    };
  }, [applyElementToModalLayer, boundKeyboard, openModalLayer]);

  return <Text>Demo</Text>;
}

let currentUnmount: (() => void) | null = null;

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

async function pressKey(
  stdin: { write: (data: string) => void },
  key: string,
): Promise<void> {
  await act(async () => {
    stdin.write(key);
  });
}

function renderApp() {
  const app = render(
    <ScenarioManagementProvider defaultScreen={Demo}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  currentUnmount = app.unmount;
  return app;
}

describe('modal integration', () => {
  beforeEach(() => {
    clearRegistry();
    registerComponent(Demo, {});
  });

  afterEach(() => {
    currentUnmount?.();
    currentUnmount = null;
    clearDispatchers();
    vi.clearAllMocks();
  });

  it('consumes return while the modal is open', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'm');
    await flush();
    await pressKey(stdin, '\r');
    await flush();

    expect(handlers.modalReturn).toHaveBeenCalledTimes(1);
    expect(handlers.pageReturn).not.toHaveBeenCalled();
  });

  it('passes allowed keys through to the page', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'm');
    await flush();
    await pressKey(stdin, 't');
    await flush();

    expect(handlers.pageT).toHaveBeenCalledTimes(1);
  });

  it('lets the page receive keys after the modal closes', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'm');
    await flush();
    await pressKey(stdin, 'e');
    await flush();
    await pressKey(stdin, '\r');
    await flush();

    expect(handlers.modalReturn).not.toHaveBeenCalled();
    expect(handlers.pageReturn).toHaveBeenCalledTimes(1);
  });
});
