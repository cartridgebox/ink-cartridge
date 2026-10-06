import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import React from 'react';
import { Text } from 'ink';
import {
  Menu,
  GameLevel,
  renderWithCapture,
  setupBaseScreenTests,
  teardownBaseScreenTests,
} from './_helpers.js';
import type { ScreenSystemContextValue } from '../../../src/screen/context.js';

beforeEach(() => {
  setupBaseScreenTests();
});

afterEach(() => {
  teardownBaseScreenTests();
  vi.restoreAllMocks();
});

function Popup() {
  return <Text>popup!</Text>;
}

function openPopup(
  ctx: ScreenSystemContextValue,
  layerId: string,
  zIndex = 1,
  options?: { crossPage?: boolean },
) {
  ctx.openLayer(layerId, zIndex, options);
  ctx.applyElement(layerId, { elementId: `${layerId}-el`, element: Popup });
}

describe('openLayer', () => {
  it('opens a layer without affecting the current navigation path', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;
    const pathBefore = [...ctx.currentPath];

    act(() => {
      openPopup(ctx, 'notif-1');
    });

    const updated = getCapture()!;
    expect(updated.currentPath).toEqual(pathBefore);
    expect(updated.allLayers.length).toBe(1);
    expect(updated.allLayers[0].layerId).toBe('notif-1');
    expect(updated.allLayers[0].elements.size).toBe(1);
  });

  it('ignores opening a layer with a duplicate ID', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'dup');
    });
    expect(getCapture()!.allLayers.length).toBe(1);

    act(() => {
      ctx.openLayer('dup', 2);
    });
    // Ignored, not thrown: the existing layer keeps its z-index and a
    // development warning explains the no-op.
    expect(getCapture()!.allLayers.length).toBe(1);
    expect(getCapture()!.allLayers[0].zIndex).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('already registered'),
    );
  });
});

describe('invalid targets', () => {
  it('ignores an element applied to an unopened layer, warning in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getCapture, lastFrame } = renderWithCapture(Menu);

    act(() => {
      getCapture()!.applyElement('missing-layer', {
        elementId: 'e1',
        element: Popup,
      });
    });

    // Not a throw: the action is ignored and the app keeps rendering.
    expect(getCapture()!.allLayers).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('has not been registered'),
    );
    expect(lastFrame()).toContain('Menu');
  });
});

describe('closeLayer', () => {
  it('closes a layer by its ID', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
    });
    expect(getCapture()!.allLayers.length).toBe(1);

    act(() => {
      ctx.closeLayer('n1');
    });

    expect(getCapture()!.allLayers.length).toBe(0);
  });

  it('does nothing when closing a layer with an unknown ID', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
    });
    expect(getCapture()!.allLayers.length).toBe(1);

    ctx.closeLayer('nonexistent');
    expect(getCapture()!.allLayers.length).toBe(1);
  });
});

describe('closeAllLayer', () => {
  it('closes all layers at once', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
      openPopup(ctx, 'n2', 2);
    });
    expect(getCapture()!.allLayers.length).toBe(2);

    act(() => {
      ctx.closeAllLayer();
    });

    expect(getCapture()!.allLayers.length).toBe(0);
  });
});

describe('activate / deactivate element', () => {
  it('controls the active state of a layer element', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
    });
    expect(getCapture()!.allLayers[0].elements.get('n1-el')?.active).not.toBe(
      false,
    );

    act(() => {
      ctx.deactivateElement('n1', 'n1-el');
    });
    expect(getCapture()!.allLayers[0].elements.get('n1-el')?.active).toBe(false);

    act(() => {
      ctx.activateElement('n1', 'n1-el');
    });
    expect(getCapture()!.allLayers[0].elements.get('n1-el')?.active).not.toBe(
      false,
    );
  });

  it('does nothing when activating an unknown element', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
    });
    ctx.activateElement('n1', 'missing');
    expect(getCapture()!.allLayers[0].elements.size).toBe(1);
    ctx.deactivateElement('n1', 'missing');
    expect(getCapture()!.allLayers[0].elements.size).toBe(1);
  });
});

describe('layer ordering', () => {
  it('sorts layers by zIndex', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'low', 1);
      openPopup(ctx, 'high', 10);
    });

    expect(getCapture()!.allLayers.map((layer) => layer.zIndex)).toEqual([
      1,
      10,
    ]);
  });

  it('uses createdAt as tiebreaker when two layers have the same zIndex', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'first', 5);
      openPopup(ctx, 'second', 5);
    });

    expect(getCapture()!.allLayers.map((layer) => layer.layerId)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('multiple layers', () => {
  it('allows different elements in multiple layers', () => {
    const { getCapture, lastFrame } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
      openPopup(ctx, 'n2', 2);
    });

    expect(getCapture()!.allLayers.length).toBe(2);
    expect(lastFrame()).toContain('popup!');
  });

  it('closing one layer does not affect the others', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
      openPopup(ctx, 'n2', 2);
    });
    expect(getCapture()!.allLayers.length).toBe(2);

    act(() => {
      ctx.closeLayer('n1');
    });

    const layers = getCapture()!.allLayers.map((layer) => layer.layerId);
    expect(layers).toEqual(['n2']);
  });
});

describe('cross-page layers', () => {
  it('clears non-crossPage layers on skip navigation', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1');
    });
    expect(getCapture()!.allLayers.length).toBe(1);

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });

    expect(getCapture()!.allLayers.length).toBe(0);
  });

  it('keeps crossPage layers after skip navigation', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      openPopup(ctx, 'n1', 1, { crossPage: true });
    });

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });

    expect(getCapture()!.allLayers.map((layer) => layer.layerId)).toEqual([
      'n1',
    ]);
  });
});
