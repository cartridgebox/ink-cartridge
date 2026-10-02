import { stripAnsi, flush, press } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { NumberInput } from '../../src/NumberInput.js';

const KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
} as const;

function renderNumberInput(props: {
  focusId: string;
  value?: number;
  onChange?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const onChange = props.onChange ?? vi.fn();

  function HostScreen() {
    return (
      <NumberInput
        focusId={props.focusId}
        value={props.value ?? 0}
        onChange={onChange}
        min={props.min}
        max={props.max}
        step={props.step}
      />
    );
  }
  HostScreen.displayName = 'HostScreen';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider defaultScreen={HostScreen}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );

  return { lastFrame, lastFrameClean: () => stripAnsi(lastFrame() ?? ''), stdin, unmount, onChange };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NumberInput', () => {
  it('renders initial value', async () => {
    const { lastFrameClean } = renderNumberInput({ focusId: 'num', value: 42 });
    expect(lastFrameClean()).toContain('42');
  });

  it('up arrow increments value', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    await press(stdin, KEYS.up);
    await flush();

    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('down arrow decrements value', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    await press(stdin, KEYS.down);
    await flush();

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('does not go below min', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 0, min: 0 });
    await flush();

    await press(stdin, KEYS.down);
    await flush();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not exceed max', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 10, max: 10 });
    await flush();

    await press(stdin, KEYS.up);
    await flush();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('custom step', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5, step: 3 });
    await flush();

    await press(stdin, KEYS.up);
    await flush();

    expect(onChange).toHaveBeenCalledWith(8);
  });

  it('shows cursor when focused', async () => {
    const { lastFrameClean } = renderNumberInput({ focusId: 'num', value: 7 });
    await flush();
    expect(lastFrameClean()).toContain('7█');
  });

  it('digit input appends to value', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    await press(stdin, '3');
    await flush();

    expect(onChange).toHaveBeenCalledWith(53);
  });

  it('digit input builds multi-digit number', async () => {
    const onChange = vi.fn();
    const { stdin } = renderNumberInput({ focusId: 'num', value: 1, onChange });
    await flush();

    await press(stdin, '2');
    await flush();
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it('non-digit character does not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderNumberInput({ focusId: 'num', value: 5, onChange });
    await flush();

    await press(stdin, 'a');
    await flush();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('digit input respects max clamping', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 25, max: 30 });
    await flush();

    await press(stdin, '9');
    await flush();

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('digit input respects min clamping', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: -5, min: -10 });
    await flush();

    await press(stdin, '0');
    await flush();

    expect(onChange).toHaveBeenCalledWith(-10);
  });

  it('digit input clamps to max — same value means no onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderNumberInput({ focusId: 'num', value: 30, max: 30, onChange });
    await flush();

    await press(stdin, '5');
    await flush();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('right arrow increments value', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    await press(stdin, KEYS.right);
    await flush();

    expect(onChange).toHaveBeenCalledWith(6);
  });

  it('left arrow decrements value', async () => {
    const { stdin, onChange } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    await press(stdin, KEYS.left);
    await flush();

    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('unmount cleanup removes keyboard bindings', async () => {
    const { unmount } = renderNumberInput({ focusId: 'num', value: 5 });
    await flush();

    // Unmount triggers cleanup: up(), down(), wildcard() unbind
    expect(() => unmount()).not.toThrow();
  });

  it('NaN value guard — digit input does not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderNumberInput({ focusId: 'num', value: NaN, onChange });
    await flush();

    await press(stdin, '5');
    await flush();

    // isNaN(value) guards against NaN propagation
    expect(onChange).not.toHaveBeenCalled();
  });
});
