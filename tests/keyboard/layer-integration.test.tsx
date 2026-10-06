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
import { LayerElementContext } from '../../src/screen/LayerElementContext.js';

const handlers = {
  a1: vi.fn(),
  a2: vi.fn(),
  bX: vi.fn(),
  bZ: vi.fn(),
  pageReturn: vi.fn(),
  pageS: vi.fn(),
  seqComplete: vi.fn(),
  ordinaryX: vi.fn(),
  ordinaryY: vi.fn(),
  pageX: vi.fn(),
};

let currentUnmount: (() => void) | null = null;

function ElementA1() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard, penetration } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unbind = boundKeyboard(
      ['return'],
      () => handlers.a1(),
      { elementId: ctx.id },
    );
    const unpenetrate = penetration(['x'], { elementId: ctx.id });
    return () => {
      unbind();
      unpenetrate();
    };
  }, [boundKeyboard, penetration, ctx]);

  return <Text>A1</Text>;
}

function ElementA2() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unbind = boundKeyboard(
      ['return'],
      () => handlers.a2(),
      { elementId: ctx.id },
    );
    return unbind;
  }, [boundKeyboard, ctx]);

  return <Text>A2</Text>;
}

function ElementB1() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard, stop } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unbindX = boundKeyboard(
      ['x'],
      () => handlers.bX(),
      { elementId: ctx.id },
    );
    const unbindZ = boundKeyboard(
      ['z'],
      () => handlers.bZ(),
      { elementId: ctx.id },
    );
    const unstop = stop(['s'], { elementId: ctx.id });
    return () => {
      unbindX();
      unbindZ();
      unstop();
    };
  }, [boundKeyboard, stop, ctx]);

  return <Text>B1</Text>;
}

function SequenceElement() {
  const ctx = useContext(LayerElementContext);
  const { boundSequence } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unbind = boundSequence(
      ['x', 'y'],
      () => handlers.seqComplete(),
      { elementId: ctx.id },
    );
    return unbind;
  }, [boundSequence, ctx]);

  return <Text>Seq</Text>;
}

function OrdinaryElement() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unbindX = boundKeyboard(
      ['x'],
      () => handlers.ordinaryX(),
      { elementId: ctx.id },
    );
    const unbindY = boundKeyboard(
      ['y'],
      () => handlers.ordinaryY(),
      { elementId: ctx.id },
    );
    return () => {
      unbindX();
      unbindY();
    };
  }, [boundKeyboard, ctx]);

  return <Text>Ord</Text>;
}

function StopPenElement() {
  const ctx = useContext(LayerElementContext);
  const { penetration, stop } = useKeyboard();

  useEffect(() => {
    if (!ctx) return;
    const unpenetrate = penetration(['x'], { elementId: ctx.id });
    const unstop = stop(['x'], { elementId: ctx.id });
    return () => {
      unpenetrate();
      unstop();
    };
  }, [ctx, penetration, stop]);

  return <Text>SP</Text>;
}

function Demo() {
  const { openLayer, applyElement, closeAllLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const openA = boundKeyboard(['a'], () => {
      openLayer('layer-a', 10);
      applyElement('layer-a', { elementId: 'a1', element: ElementA1 });
      applyElement('layer-a', { elementId: 'a2', element: ElementA2 });
    });
    const openB = boundKeyboard(['b'], () => {
      openLayer('layer-b', 5);
      applyElement('layer-b', { elementId: 'b1', element: ElementB1 });
    });
    const closeLayers = boundKeyboard(['c'], () => closeAllLayer());
    const pageReturn = boundKeyboard(['return'], () => handlers.pageReturn());
    const pageS = boundKeyboard(['s'], () => handlers.pageS());
    const pageX = boundKeyboard(['x'], () => handlers.pageX());
    const openSeqLayer = boundKeyboard(['q'], () => {
      openLayer('layer-seq', 20);
      applyElement('layer-seq', {
        elementId: 'seq',
        element: SequenceElement,
      });
      applyElement('layer-seq', {
        elementId: 'ord',
        element: OrdinaryElement,
      });
    });
    const openStopPenLayer = boundKeyboard(['t'], () => {
      openLayer('layer-sp', 15);
      applyElement('layer-sp', {
        elementId: 'sp',
        element: StopPenElement,
      });
    });

    return () => {
      openA();
      openB();
      closeLayers();
      pageReturn();
      pageS();
      pageX();
      openSeqLayer();
      openStopPenLayer();
    };
  }, [applyElement, boundKeyboard, closeAllLayer, openLayer]);

  return <Text>Demo</Text>;
}

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

describe('layer integration', () => {
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

  it('broadcasts return to every active element in layer A', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'a');
    await flush();
    await pressKey(stdin, '\r');
    await flush();

    expect(handlers.a1).toHaveBeenCalledTimes(1);
    expect(handlers.a2).toHaveBeenCalledTimes(1);
  });

  it('penetrates layer A so layer B handles x', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'a');
    await flush();
    await pressKey(stdin, 'b');
    await flush();
    await pressKey(stdin, 'x');
    await flush();

    expect(handlers.bX).toHaveBeenCalledTimes(1);
  });

  it('bubbles an unmatched key from layer A to layer B', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'a');
    await flush();
    await pressKey(stdin, 'b');
    await flush();
    await pressKey(stdin, 'z');
    await flush();

    expect(handlers.bZ).toHaveBeenCalledTimes(1);
  });

  it('stops s at layer B before the page receives it', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'a');
    await flush();
    await pressKey(stdin, 'b');
    await flush();
    await pressKey(stdin, 's');
    await flush();

    expect(handlers.pageS).not.toHaveBeenCalled();
  });

  it('lets the page receive return when no layer is open', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, '\r');
    await flush();

    expect(handlers.pageReturn).toHaveBeenCalledTimes(1);
  });

  it('gives sequences priority over ordinary bindings in the same layer', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 'q');
    await flush();
    await pressKey(stdin, 'x');
    await flush();

    expect(handlers.ordinaryX).not.toHaveBeenCalled();

    await pressKey(stdin, 'y');
    await flush();

    expect(handlers.seqComplete).toHaveBeenCalledTimes(1);
    expect(handlers.ordinaryY).not.toHaveBeenCalled();
  });

  it('keeps stop priority when the same key is also penetrated', async () => {
    const { stdin } = renderApp();
    await flush();

    await pressKey(stdin, 't');
    await flush();
    await pressKey(stdin, 'x');
    await flush();

    expect(handlers.pageX).not.toHaveBeenCalled();
  });
});
