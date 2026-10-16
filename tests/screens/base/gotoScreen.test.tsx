import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { gotoScreen } from '../../../src/screen/provider.js';
import { registerComponent } from '../../../src/screen/registry.js';
import {
  Menu,
  GameLevel,
  Combat,
  Settings,
  StatefulScreen,
  statefulMountCount,
  renderWithCapture,
  setupBaseScreenTests,
  teardownBaseScreenTests,
} from './_helpers.js';
import React from 'react';
import { Text } from 'ink';

beforeEach(() => {
  setupBaseScreenTests();
});

afterEach(() => {
  teardownBaseScreenTests();
  vi.restoreAllMocks();
});

describe('gotoScreen', () => {
  it('jumps across branches via LCA resolution', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    act(() => {
      ctx.skip(Combat, { enemy: 'goblin' });
    });
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel, Combat]);

    act(() => {
      ctx.gotoScreen(Settings, { theme: 'light' });
    });

    const updated = getCapture()!;
    expect(updated.currentPath.map((p) => p.component)).toEqual([Menu, Settings]);
  });

  it('throws when the target component is not registered', () => {
    function Ghost() {
      return null;
    }
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    // The is-registered guard runs before dispatch, so the error throws synchronously.
    expect(() => ctx.gotoScreen(Ghost as any, {})).toThrow(
      'is not registered',
    );
  });

  it('works at module level the same as the hook version', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);

    act(() => {
      gotoScreen(Settings, { theme: 'solarized' });
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, Settings]);
  });

  it('clears all open overlays when navigating via gotoScreen', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    act(() => {
      ctx.openLayer('n1', 1);
      ctx.applyElement('n1', {
        elementId: 'n1-el',
        element: () => <Text>popup</Text>,
      });
    });
    expect(getCapture()!.allLayers.length).toBe(1);

    act(() => {
      ctx.gotoScreen(Settings, { theme: 'dark' });
    });

    expect(getCapture()!.allLayers.length).toBe(0);
  });

  it('clears all open modals when navigating via gotoScreen', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.openModalLayer('m1', 1);
      ctx.applyElementToModalLayer('m1', {
        elementId: 'm1-el',
        element: () => <Text>modal</Text>,
      });
    });
    expect(getCapture()!.allModalLayers.length).toBe(1);

    act(() => {
      ctx.gotoScreen(Settings, { theme: 'dark' });
    });

    const updated = getCapture()!;
    expect(updated.allModalLayers.length).toBe(0);
  });

  it('throws when called at module level without a mounted Provider', () => {
    expect(() => gotoScreen(Menu, {})).toThrow(
      /called before Provider is mounted/,
    );
  });
});

describe('gotoScreen to a screen already on the path', () => {
  beforeEach(() => {
    statefulMountCount.current = 0;
  });

  it('applies params and remounts the current screen by default', async () => {
    const { getCapture, lastFrame } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    await act(async () => {
      ctx.skip(StatefulScreen, { label: 'a' });
    });
    expect(statefulMountCount.current).toBe(1);

    await act(async () => {
      ctx.gotoScreen(StatefulScreen, { label: 'b' });
    });

    expect(lastFrame()).toContain('label:b');
    expect(statefulMountCount.current).toBe(2);
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([
      Menu,
      StatefulScreen,
    ]);
  });

  it('updates props without remounting when onlyAttribute is true', async () => {
    const { getCapture, lastFrame } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    await act(async () => {
      ctx.skip(StatefulScreen, { label: 'a' });
    });
    expect(statefulMountCount.current).toBe(1);

    await act(async () => {
      ctx.gotoScreen(StatefulScreen, { label: 'b' }, { onlyAttribute: true });
    });

    expect(lastFrame()).toContain('label:b');
    expect(statefulMountCount.current).toBe(1);
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([
      Menu,
      StatefulScreen,
    ]);
  });

  it('applies params when jumping to an ancestor already on the path', async () => {
    const { getCapture, lastFrame } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    await act(async () => {
      ctx.skip(GameLevel, { level: 1 });
    });
    await act(async () => {
      ctx.skip(Combat, { enemy: 'goblin' });
    });

    await act(async () => {
      ctx.gotoScreen(GameLevel, { level: 7 });
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([
      Menu,
      GameLevel,
    ]);
    expect(lastFrame()).toContain('Level 7');
  });
});

describe('gotoScreen param optionality', () => {
  it('jumps to a prop-less screen without passing params', () => {
    function About() {
      return <Text>About</Text>;
    }
    registerComponent(About, {}, { parent: Menu });

    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.gotoScreen(About);
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([
      Menu,
      About,
    ]);
  });

  it('requires params for a target with required props', () => {
    // Type-only assertion: never invoked, so nothing navigates at runtime.
    // tsc (tests/tsconfig.json) verifies the line compiles as expected.
    const neverCalled = () => {
      // GameLevel requires `level` — omitting params must be a type error.
      // @ts-expect-error params is required when the target has required props
      gotoScreen(GameLevel);
    };
    expect(neverCalled).toBeDefined();
  });
});
