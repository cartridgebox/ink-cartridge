import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { back } from '../../../src/screen/provider.js';
import {
  Menu,
  GameLevel,
  Combat,
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

describe('back', () => {
  it('returns from a child to its parent', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);

    act(() => {
      ctx.back();
    });

    const updated = getCapture()!;
    expect(updated.currentPath.map((p) => p.component)).toEqual([Menu]);
  });

  it('returns from a grandchild to its parent', () => {
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
      ctx.back();
    });

    const updated = getCapture()!;
    expect(updated.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);
  });

  it('does nothing when called at the root node', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;
    expect(ctx.currentPath.map((p) => p.component)).toEqual([Menu]);

    // back at the root is rejected by the reducer; the path must not change.
    ctx.back();

    const updated = getCapture()!;
    expect(updated.currentPath.map((p) => p.component)).toEqual([Menu]);
  });

  it('works at module level the same as the hook version', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);

    act(() => {
      back();
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu]);
  });

  it('back(2) goes back two levels at once', () => {
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
      ctx.back(2);
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu]);
  });

  it('back(1) is equivalent to back() with no arguments', () => {
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
      ctx.back(1);
    });

    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);
  });

  it('throws when back(0) is called (levels must be an integer >= 1)', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });

    // The levels guard runs before dispatch, so the error throws synchronously.
    expect(() => ctx.back(0)).toThrow('levels must be an integer >= 1');
  });

  it('rejects NaN and fractional levels before dispatch, leaving the path unchanged', () => {
    const { getCapture } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });

    // `NaN < 1` is false and a fraction truncates in the reducer's
    // `slice(0, -levels)` — either would corrupt the path (NaN empties it).
    expect(() => ctx.back(NaN)).toThrow('levels must be an integer >= 1');
    expect(() => ctx.back(1.5)).toThrow('levels must be an integer >= 1');
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);
  });

  it('rejects back(n) when n exceeds the current depth, leaving the path unchanged', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getCapture, lastFrame } = renderWithCapture(Menu);
    const ctx = getCapture()!;

    act(() => {
      ctx.skip(GameLevel, { level: 1 });
    });
    expect(getCapture()!.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);

    // back(5) exceeds depth of 2 — the action is ignored: no exception (a
    // throw inside the reducer would not be catchable and would unmount the
    // app), the path stays put, and development gets a warning.
    act(() => {
      ctx.back(5);
    });

    const updated = getCapture()!;
    expect(updated.currentPath.map((p) => p.component)).toEqual([Menu, GameLevel]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('back(5) failed'));
    expect(lastFrame()).toContain('Level 1');
  });

  it('clears all open overlays when navigating via back', () => {
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
      ctx.back();
    });

    expect(getCapture()!.allLayers.length).toBe(0);
  });

  it('throws when called at module level without a mounted Provider', () => {
    expect(() => back()).toThrow(/called before Provider is mounted/);
  });
});
