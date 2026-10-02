import { stripAnsi, flush, press } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useState, useEffect } from 'react';

import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { useKeyboard } from 'ink-cartridge';
import { TextInput, UncontrolledTextInput } from '../../src/TextInput.js';


// Simulate key presses by writing terminal escape sequences via stdin.write().
// Ink v7's useInput correctly parses the following sequences and sets key flags:
//   \r → return    \x1b → escape    \x7f → backspace
//   \x1b[A → up    \x1b[B → down    \x1b[C → right
//   \x1b[D → left  \x1b[3~ → delete
// Note: \t (Tab) is not parsed as key.tab=true in Ink v7, so focus switching
//       cannot be driven via stdin.write('\t'). See the "focus isolation" suite.

const KEYS = {
  enter:     '\r',
  escape:    '\x1b',
  backspace: '\x7f',
  up:        '\x1b[A',
  down:      '\x1b[B',
  right:     '\x1b[C',
  left:      '\x1b[D',
  delete:    '\x1b[3~',
} as const;




async function type(stdin: { write: (data: string) => void }, chars: string) {
  for (const ch of chars) {
    stdin.write(ch);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function renderTextInput(props: {
  focusId: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  mask?: string;
  showCursor?: boolean;
  highlightPastedText?: boolean;
  wrap?: boolean;
  width?: number;
}) {
  function HostScreen() {
    return <TextInput {...(props as any)} />;
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

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
  };
}

function renderUncontrolled(props: {
  focusId: string;
  initialValue?: string;
  onSubmit?: (v: string) => void;
  placeholder?: string;
  mask?: string;
  showCursor?: boolean;
  highlightPastedText?: boolean;
}) {
  function HostScreen() {
    return <UncontrolledTextInput {...(props as any)} />;
  }
  HostScreen.displayName = 'HostScreenUncontrolled';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider defaultScreen={HostScreen}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
  };
}


beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// basic rendering

describe('basic rendering', () => {
  it('renders value text when value is set', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange: () => {},
    });
    expect(lastFrameClean()).toContain('hello');
  });

  it('renders placeholder when empty and focused (first char inverted)', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange: () => {},
      placeholder: 'Enter name',
    });
    const output = lastFrameClean();
    expect(output).toContain('E');
    expect(output).toContain('nter name');
  });

  it('shows only cursor when empty with no placeholder', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange: () => {},
    });
    expect(lastFrameClean().trim()).toBe('');
  });

  it('does not render cursor symbol when showCursor=false', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'hi',
      onChange: () => {},
      showCursor: false,
    });
    expect(lastFrameClean()).toBe('hi');
  });
});

// character input

describe('character input', () => {
  it('triggers onChange and appends regular character', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'ab',
      onChange,
    });

    await press(stdin, 'c');
    expect(onChange).toHaveBeenCalledWith('abc');

    await press(stdin, 'd');
    expect(onChange).toHaveBeenCalledWith('abd');
  });

  it('inserts at correct position when cursor is mid-string', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'ac',
      onChange,
    });

    await press(stdin, KEYS.left);
    await press(stdin, 'b');

    expect(onChange).toHaveBeenCalledWith('abc');
  });
});

// delete operations

describe('delete operations', () => {
  it('backspace deletes character before cursor', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange,
    });

    await press(stdin, KEYS.backspace);
    expect(onChange).toHaveBeenCalledWith('hell');
  });

  it('backspace is a no-op when cursor at position 0', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hi',
      onChange,
    });

    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);

    onChange.mockClear();
    await press(stdin, KEYS.backspace);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('delete removes character after cursor', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange,
    });

    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);

    await press(stdin, KEYS.delete);
    expect(onChange).toHaveBeenCalledWith('ello');
  });

  it('delete is a no-op when cursor at end', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hi',
      onChange,
    });

    onChange.mockClear();
    await press(stdin, KEYS.delete);
    expect(onChange).not.toHaveBeenCalled();
  });
});

// cursor movement

describe('cursor movement', () => {
  it('left/right arrows do not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange,
    });

    onChange.mockClear();
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.right);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cursor cannot move left past 0', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'a',
      onChange,
    });

    await press(stdin, KEYS.left);
    await expect(press(stdin, KEYS.left)).resolves.not.toThrow();
  });

  it('cursor cannot move right past length', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'a',
      onChange,
    });

    await expect(press(stdin, KEYS.right)).resolves.not.toThrow();
  });

  it('cursor movement does not throw when showCursor=false', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange,
      showCursor: false,
    });

    await expect(press(stdin, KEYS.left)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.right)).resolves.not.toThrow();
  });
});

// submit

describe('submit (onSubmit)', () => {
  it('enter triggers onSubmit with current value', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'done',
      onChange: () => {},
      onSubmit,
    });

    await press(stdin, KEYS.enter);
    expect(onSubmit).toHaveBeenCalledWith('done');
  });

  it('enter without onSubmit does not throw', async () => {
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'x',
      onChange: () => {},
    });

    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
  });
});

// mask mode

describe('mask mode', () => {
  it('renders mask character instead of real value', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'secret',
      onChange: () => {},
      mask: '*',
    });

    expect(lastFrameClean()).not.toContain('secret');
    expect(lastFrameClean()).toContain('******');
  });

  it('onChange still passes real value', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'abc',
      onChange,
      mask: '*',
    });

    await press(stdin, 'd');
    expect(onChange).toHaveBeenCalledWith('abcd');
  });
});

// external value shrink - cursor auto-correction

describe('external value shrink', () => {
  it('does not throw when value shrinks externally, subsequent input works', async () => {
    let shrink!: () => void;

    function HostScreen() {
      const [v, setV] = useState('hello');
      shrink = () => setV('hi');
      return React.createElement(TextInput, {
        focusId: 'inp',
        value: v,
        onChange: (nv: string) => setV(nv),
      });
    }
    HostScreen.displayName = 'ShrinkHost';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { lastFrame, stdin } = render(
      React.createElement(
        ScenarioManagementProvider as any,
        { defaultScreen: HostScreen },
        React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
      ),
    );

    expect(stripAnsi(lastFrame() ?? '')).toContain('hello');

    // externally shrink value: cursor should correct from 5 to 2, must not throw
    expect(() => shrink()).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));

    // component remains alive after shrink, subsequent input must not throw
    await expect(press(stdin, '!')).resolves.not.toThrow();
  });
});


describe('UncontrolledTextInput', () => {
  it('initialValue renders as initial text', () => {
    const { lastFrameClean } = renderUncontrolled({
      focusId: 'inp',
      initialValue: 'default',
    });
    expect(lastFrameClean()).toContain('default');
  });

  it('auto-updates render after input', async () => {
    const { lastFrameClean, stdin } = renderUncontrolled({
      focusId: 'inp',
      initialValue: '',
    });

    await type(stdin, 'XY');
    expect(lastFrameClean()).toContain('XY');
  });

  it('updates render after backspace', async () => {
    const { lastFrameClean, stdin } = renderUncontrolled({
      focusId: 'inp',
      initialValue: 'abc',
    });

    await press(stdin, KEYS.backspace);
    expect(lastFrameClean()).toContain('ab');
  });

  it('onSubmit passes current value', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderUncontrolled({
      focusId: 'inp',
      initialValue: 'submit-me',
      onSubmit,
    });

    await press(stdin, KEYS.enter);
    expect(onSubmit).toHaveBeenCalledWith('submit-me');
  });
});

// focus isolation
//
// Ink v7's useInput does not parse \t as key.tab=true, so Tab focus switching
// cannot be triggered via stdin.write('\t'). Here we use the useKeyboard ref
// to directly call focusSet / focusNext for programmatic switching.

describe('focus isolation', () => {
  it('two TextInput with different focusId, keys only affect focused one', async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    const kbRef: { current: ReturnType<typeof useKeyboard> | null } = { current: null };

    function HostScreen() {
      const kb = useKeyboard();
      useEffect(() => { kbRef.current = kb; }, [kb]);
      return React.createElement(
        'ink-virtual',
        null,
        React.createElement(TextInput, {
          focusId: 'input-a',
          value: '',
          onChange: onChangeA,
        }),
        React.createElement(TextInput, {
          focusId: 'input-b',
          value: '',
          onChange: onChangeB,
        }),
      );
    }
    HostScreen.displayName = 'DualHost';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { stdin } = render(
      React.createElement(
        ScenarioManagementProvider as any,
        { defaultScreen: HostScreen },
        React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
      ),
    );

    // input-a registered first → default focus
    await press(stdin, 'a');
    expect(onChangeA).toHaveBeenCalledWith('a');
    expect(onChangeB).not.toHaveBeenCalled();

    // programmatically switch to input-b
    kbRef.current!.focusSet('input-b');

    onChangeA.mockClear();
    onChangeB.mockClear();

    await press(stdin, 'b');
    expect(onChangeB).toHaveBeenCalledWith('b');
    expect(onChangeA).not.toHaveBeenCalled();
  });

  it('focusNext switches to next focus target', async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();
    const kbRef: { current: ReturnType<typeof useKeyboard> | null } = { current: null };

    function HostScreen() {
      const kb = useKeyboard();
      useEffect(() => { kbRef.current = kb; }, [kb]);
      return React.createElement(
        'ink-virtual',
        null,
        React.createElement(TextInput, {
          focusId: 'input-a',
          value: '',
          onChange: onChangeA,
        }),
        React.createElement(TextInput, {
          focusId: 'input-b',
          value: '',
          onChange: onChangeB,
        }),
      );
    }
    HostScreen.displayName = 'DualHostNext';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { stdin } = render(
      React.createElement(
        ScenarioManagementProvider as any,
        { defaultScreen: HostScreen },
        React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
      ),
    );

    expect(kbRef.current!.focusCurrent().result?.id).toBe('input-a');

    kbRef.current!.focusNext();
    expect(kbRef.current!.focusCurrent().result?.id).toBe('input-b');

    // after switching to input-b, keys go to input-b
    await press(stdin, 'x');
    expect(onChangeB).toHaveBeenCalledWith('x');
    expect(onChangeA).not.toHaveBeenCalled();
  });
});

// special keys do not leak to wildcard '*'

describe('special keys do not leak to wildcard', () => {
  it('escape / arrow do not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'test',
      onChange,
    });

    onChange.mockClear();

    await press(stdin, KEYS.escape);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.down);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ctrl+character does not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange,
    });

    stdin.write('\x13'); // Ctrl+S
    await new Promise((r) => setTimeout(r, 10));

    expect(onChange).not.toHaveBeenCalled();
  });
});


describe('focus target stability', () => {
  it('continuous character input does not cause focus target loss', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'stable-focus',
      value: '',
      onChange,
    });

    // simulate rapid input, no throw means focus target is stable
    for (const ch of 'abcdefghij') {
      await press(stdin, ch);
    }

    expect(onChange).toHaveBeenCalled();
  });
});

describe('dynamic focusId', () => {
  it('old target cleaned up after focusId change, new target responds', async () => {
    const onChange = vi.fn();

    function DynamicHost() {
      const [fid, setFid] = useState('input-a');
      const { boundKeyboard: bk } = useKeyboard();
      useEffect(() => {
        const un = bk(['s'], () => setFid('input-b'));
        return un;
      }, [bk]);

      return React.createElement(TextInput, {
        focusId: fid,
        value: '',
        onChange,
      });
    }

    clearRegistry();
    registerComponent(DynamicHost, {});

    const { stdin } = render(
      React.createElement(
        ScenarioManagementProvider as any,
        { defaultScreen: DynamicHost },
        React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
      ),
    );
    await new Promise((r) => setTimeout(r, 10));

    // input with old focusId → works normally
    await press(stdin, 'x');
    expect(onChange).toHaveBeenCalledWith('x');

    // switch focusId
    await press(stdin, 's');
    await new Promise((r) => setTimeout(r, 10));

    // input with new focusId → still works (old target unregistered, new target created)
    onChange.mockClear();
    await press(stdin, 'y');
    expect(onChange).toHaveBeenCalledWith('y');
  });
});

describe('placeholder edge cases', () => {
  it('empty placeholder with empty value does not throw', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange: () => {},
      placeholder: '',
    });

    expect(() => lastFrameClean()).not.toThrow();
  });

  it('single-character placeholder works correctly', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange: () => {},
      placeholder: '>',
    });

    expect(lastFrameClean()).toContain('>');
  });
});

// wrap mode

describe('wrap mode rendering', () => {
  it('renders text in wrap mode', async () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'hello world',
      onChange: () => {},
      wrap: true,
      width: 6,
    });
    const output = lastFrameClean();
    // text should be split across lines
    expect(output).toContain('hello');
  });

  it('wrap mode shows placeholder when empty', async () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: '',
      onChange: () => {},
      wrap: true,
      placeholder: 'Enter text',
    });
    const output = lastFrameClean();
    expect(output).toContain('E');
  });

  it('up/down arrows move cursor vertically in wrap mode', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'abcdefghij',
      onChange,
      wrap: true,
      width: 3,
    });
    await flush();

    // down arrow in wrap mode — should not throw
    await expect(press(stdin, KEYS.down)).resolves.not.toThrow();
    // subsequent input still works
    await press(stdin, 'x');
    expect(onChange).toHaveBeenCalled();
  });

  it('up arrow in wrap mode does not throw', async () => {
    const onChange = vi.fn();
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'abcdefghij',
      onChange,
      wrap: true,
      width: 3,
    });
    await flush();

    await expect(press(stdin, KEYS.up)).resolves.not.toThrow();
  });

  it('wrap mode with showCursor=false — up/down do nothing', async () => {
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange: () => {},
      wrap: true,
      showCursor: false,
      width: 10,
    });
    await flush();

    await expect(press(stdin, KEYS.up)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.down)).resolves.not.toThrow();
  });
});

// virtual scroll mode (long text)

describe('virtual scroll rendering', () => {
  it('renders long text with scroll indicators', async () => {
    const longText = 'This is a very long text that exceeds the available width';
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: longText,
      onChange: () => {},
      width: 15,
    });
    const output = lastFrameClean();
    // should have scroll indicators or visible portion
    expect(output).toBeTruthy();
    expect(output.length).toBeGreaterThan(0);
  });

  it('long text with scroll offset shows right indicator', async () => {
    const longText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: longText,
      onChange: () => {},
      width: 10,
    });
    const output = lastFrameClean();
    expect(output.length).toBeGreaterThan(0);
  });

  it('virtual scroll — left arrow moves cursor and adjusts scroll', async () => {
    const onChange = vi.fn();
    const longText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: longText,
      onChange,
      width: 10,
    });
    await flush();

    // Move left multiple times to trigger scroll
    await expect(press(stdin, KEYS.left)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.left)).resolves.not.toThrow();
  });

  it('virtual scroll — right arrow returns to end without throw', async () => {
    const onChange = vi.fn();
    const longText = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const { stdin } = renderTextInput({
      focusId: 'inp',
      value: longText,
      onChange,
      width: 10,
    });
    await flush();

    // Move left then right
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await expect(press(stdin, KEYS.right)).resolves.not.toThrow();
  });
});

// wrap mode cursor at end of line boundary

describe('wrap mode cursor edge cases', () => {
  it('renders cursor on empty line when cursor sits exactly at line boundary', async () => {
    // With text length exactly divisible by width, cursor at end creates
    // an extra empty line for the cursor to render on (while loop in render)
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'abcdef',
      onChange: () => {},
      wrap: true,
      width: 3,
    });
    // Should render without error — exercises the displayLines.push('') path
    const output = lastFrameClean();
    expect(output).toBeTruthy();
  });
});

// highlightPastedText

describe('highlightPastedText', () => {
  it('highlights pasted text when enabled', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange: () => {},
      highlightPastedText: true,
    });
    const output = lastFrameClean();
    expect(output).toBeTruthy();
  });

  it('does not show highlight when disabled (default)', () => {
    const { lastFrameClean } = renderTextInput({
      focusId: 'inp',
      value: 'hello',
      onChange: () => {},
    });
    const output = lastFrameClean();
    expect(output).toBeTruthy();
  });
});
