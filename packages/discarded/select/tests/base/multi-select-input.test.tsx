import { stripAnsi, flush, press } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { useKeyboard } from 'ink-cartridge';
import { useScreenSystem } from 'ink-cartridge';
import { MultiSelectInput } from '../../src/multi-select/MultiSelectInput.js';
import type { Item } from '../../src/select/types.js';

const KEYS = {
  enter: '\r',
  escape: '\x1b',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  space: ' ',
} as const;



/** Wait for React effects to flush (focus registration etc.) */

const threeItems: Item<string>[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'Cyberpunk', value: 'cyberpunk' },
];

const longItems: Item<string>[] = Array.from({ length: 15 }, (_, i) => ({
  label: `Item ${String(i + 1).padStart(2, '0')}`,
  value: `v${String(i + 1).padStart(2, '0')}`,
}));

// Controlled mode render helper: maintains internal selected state, passes through all callbacks
function renderControlled(props: {
  focusId: string;
  items: Item<string>[];
  selected?: string[];
  onChange?: (selected: string[]) => void;
  onSubmit?: (selected: string[]) => void;
  onSelect?: (item: Item<string>) => void;
  onUnselect?: (item: Item<string>) => void;
  onHighlight?: (item: Item<string>) => void;
  limit?: number;
  defaultSelected?: string[];
  initialIndex?: number;
}) {
  function HostScreen() {
    const [selected, setSelected] = useState<string[]>(
      props.selected ?? props.defaultSelected ?? [],
    );
    const handleChange = (vals: string[]) => {
      setSelected(vals);
      props.onChange?.(vals);
    };
    return React.createElement(MultiSelectInput, {
      focusId: props.focusId,
      items: props.items,
      selected,
      onChange: handleChange,
      onSubmit: props.onSubmit,
      onSelect: props.onSelect,
      onUnselect: props.onUnselect,
      onHighlight: props.onHighlight,
      limit: props.limit,
      initialIndex: props.initialIndex,
    } as any);
  }
  HostScreen.displayName = 'HostScreenControlled';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    React.createElement(
      ScenarioManagementProvider as any,
      { defaultScreen: HostScreen },
      React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
    ),
  );

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
  };
}

// Dual component render helper: for focus isolation tests
function renderDualMultiSelectInput(props: { items: Item<string>[] }) {
  const onChangeA = vi.fn();
  const onChangeB = vi.fn();
  const onSubmitA = vi.fn();
  const onSubmitB = vi.fn();
  const kbRef: { current: ReturnType<typeof useKeyboard> | null } = {
    current: null,
  };

  function HostScreen() {
    const kb = useKeyboard();
    useEffect(() => {
      kbRef.current = kb;
    }, [kb]);

    const [selA, setSelA] = useState<string[]>([]);
    const [selB, setSelB] = useState<string[]>([]);

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(MultiSelectInput, {
        focusId: 'select-a',
        items: props.items,
        selected: selA,
        onChange: (vals: string[]) => {
          setSelA(vals);
          onChangeA(vals);
        },
        onSubmit: onSubmitA,
      } as any),
      React.createElement(MultiSelectInput, {
        focusId: 'select-b',
        items: props.items,
        selected: selB,
        onChange: (vals: string[]) => {
          setSelB(vals);
          onChangeB(vals);
        },
        onSubmit: onSubmitB,
      } as any),
    );
  }
  HostScreen.displayName = 'DualHostScreen';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    React.createElement(
      ScenarioManagementProvider as any,
      { defaultScreen: HostScreen },
      React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
    ),
  );

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
    onChangeA,
    onChangeB,
    onSubmitA,
    onSubmitB,
    kbRef,
  };
}

// Navigable screen render helper: for component unmount cleanup tests
function renderNavigableMultiSelect(items: Item<string>[]) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();

  function Menu() {
    const sc = useScreenSystem();
    const { boundKeyboard } = useKeyboard();
    useEffect(() => {
      boundKeyboard(['s'], () => sc.skip(Settings, {}));
    }, []);
    return React.createElement(Text, null, 'Menu - Press S to Settings');
  }
  Menu.displayName = 'Menu';

  function Settings() {
    const sc = useScreenSystem();
    const { boundKeyboard } = useKeyboard();
    const [sel, setSel] = useState<string[]>([]);
    useEffect(() => {
      boundKeyboard(['b'], () => sc.back());
    }, []);
    return React.createElement(MultiSelectInput, {
      focusId: 'settings-select',
      items,
      selected: sel,
      onChange: (vals: string[]) => {
        setSel(vals);
        onChange(vals);
      },
      onSubmit,
    } as any);
  }
  Settings.displayName = 'Settings';

  clearRegistry();
  registerComponent(Menu, {});
  registerComponent(Settings, {}, { parent: Menu });

  const { lastFrame, stdin, unmount } = render(
    React.createElement(
      ScenarioManagementProvider as any,
      { defaultScreen: Menu },
      React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
    ),
  );

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
    onChange,
    onSubmit,
  };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('basic rendering', () => {
  it('renders all item labels', () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
    });

    const output = lastFrameClean();
    expect(output).toContain('Dark');
    expect(output).toContain('Light');
    expect(output).toContain('Cyberpunk');
  });

  it('shows all checkboxes as ○ (unselected) by default', () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
    });

    const output = lastFrameClean();
    expect(output).toContain('\u25CB');
    expect(output).not.toContain('\u25C9');
  });

  it('renders empty list without throwing', () => {
    expect(() => {
      renderControlled({ focusId: 'test', items: [] });
    }).not.toThrow();
  });
});

describe('keyboard navigation', () => {
  it('down arrow moves highlight to next item', async () => {
    const onHighlight = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onHighlight,
    });

    await press(stdin, KEYS.down);
    expect(onHighlight).toHaveBeenCalledWith(threeItems[1]);
  });

  it('up arrow moves highlight to previous item', async () => {
    const onHighlight = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onHighlight,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.up);
    expect(onHighlight).toHaveBeenLastCalledWith(threeItems[1]);
  });

  it('up arrow at top does not overflow', async () => {
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
    });

    await press(stdin, KEYS.up);
    await press(stdin, KEYS.up);
    await expect(press(stdin, KEYS.up)).resolves.not.toThrow();
  });

  it('down arrow at bottom does not overflow', async () => {
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await expect(press(stdin, KEYS.down)).resolves.not.toThrow();
  });

  it('j / k map to down / up respectively', async () => {
    const onHighlight = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onHighlight,
    });

    await press(stdin, 'j');
    expect(onHighlight).toHaveBeenCalledWith(threeItems[1]);

    await press(stdin, 'k');
    expect(onHighlight).toHaveBeenCalledWith(threeItems[0]);
  });
});

describe('space toggles selection', () => {
  it('Space selects highlighted item, checkbox changes to ◉', async () => {
    const onChange = vi.fn();
    const { stdin, lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, KEYS.space);

    expect(onChange).toHaveBeenCalledWith(['dark']);

    const output = lastFrameClean();
    expect(output).toContain('\u25C9');
  });

  it('Space toggles selection off, checkbox returns to ○', async () => {
    const onChange = vi.fn();
    const { stdin, lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenLastCalledWith(['dark']);

    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenLastCalledWith([]);

    const output = stripAnsi(lastFrameClean());
    expect(output).not.toContain('\u25C9');
  });

  it('selects multiple items simultaneously', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenLastCalledWith(['dark']);

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenLastCalledWith(['dark', 'light']);

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenLastCalledWith(['dark', 'light', 'cyberpunk']);
  });

  it('onSelect / onUnselect fire on select / unselect respectively', async () => {
    const onSelect = vi.fn();
    const onUnselect = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onSelect,
      onUnselect,
    });

    await press(stdin, KEYS.space);
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
    expect(onUnselect).not.toHaveBeenCalled();

    await press(stdin, KEYS.space);
    expect(onUnselect).toHaveBeenCalledWith(threeItems[0]);
  });
});

describe('select all / deselect all', () => {
  it('a selects all items', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, 'a');
    expect(onChange).toHaveBeenCalledWith(['dark', 'light', 'cyberpunk']);
  });

  it('a fires onSelect for each unselected item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, 'a');
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('q deselects all selected items', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, 'a');
    onChange.mockClear();

    await press(stdin, 'q');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('q fires onUnselect for each selected item', async () => {
    const onUnselect = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onUnselect,
    });

    // select all, then deselect all
    await press(stdin, 'a');
    await press(stdin, 'q');

    expect(onUnselect).toHaveBeenCalledTimes(3);
    expect(onUnselect).toHaveBeenCalledWith(threeItems[0]);
    expect(onUnselect).toHaveBeenCalledWith(threeItems[1]);
    expect(onUnselect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('a/q does not throw on empty list', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: [],
      onChange,
    });

    await expect(press(stdin, 'a')).resolves.not.toThrow();
    await expect(press(stdin, 'q')).resolves.not.toThrow();
    // a fires onChange([]), q fires onChange([]) again
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('selects normally after a then q then Space', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, 'a');
    onChange.mockClear();

    await press(stdin, 'q');
    onChange.mockClear();

    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenCalledWith(['dark']);
  });
});

describe('enter submits', () => {
  it('Enter triggers onSubmit with currently selected values', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onSubmit,
    });

    await press(stdin, KEYS.space);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.space);

    await press(stdin, KEYS.enter);
    expect(onSubmit).toHaveBeenCalledWith(['dark', 'light']);
  });

  it('submits empty array when nothing selected', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onSubmit,
    });

    await press(stdin, KEYS.enter);
    expect(onSubmit).toHaveBeenCalledWith([]);
  });

  it('Enter without onSubmit does not throw', async () => {
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
    });

    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
  });
});

describe('number shortcuts', () => {
  it('press 1 toggles the 1st visible item', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, '1');
    expect(onChange).toHaveBeenCalledWith(['dark']);

    await press(stdin, '1');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('press 1 toggles the 1st visible item', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, '2');
    expect(onChange).toHaveBeenCalledWith(['light']);
  });

  it('number key exceeding visible items does not trigger onChange', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      onChange,
    });

    await press(stdin, '4');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('scrolling (items > limit)', () => {
  it('renders at most 10 items when items exceed default limit=10', async () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: longItems,
    });

    await flush();

    const output = lastFrameClean();
    expect(output).toContain('Item 01');
    expect(output).toContain('Item 10');
    expect(output).not.toContain('Item 11');
  });

  it('auto-scrolls when highlight moves past window, new items appear', async () => {
    const { lastFrameClean, stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.down);
    }

    const output = lastFrameClean();
    expect(output).not.toContain('Item 01');
    expect(output).toContain('Item 11');
  });

  it('scrolls up, old items reappear', async () => {
    const { lastFrameClean, stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.down);
    }
    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.up);
    }

    const output = lastFrameClean();
    expect(output).toContain('Item 01');
    expect(output).not.toContain('Item 11');
  });

  it('number key after scroll toggles Nth item within window', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
      onChange,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.down);
    }

    await press(stdin, '1');
    const firstCall = onChange.mock.calls[0][0] as string[];
    // after scroll, the 1st item in window is no longer the global 1st item
    expect(firstCall).not.toContain('v01');
  });

  it('Space after scroll selects the highlighted item', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
      onChange,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.space);

    expect(onChange).toHaveBeenCalledWith(['v04']);
  });
});

describe('focus system', () => {
  it('first registered MultiSelectInput automatically gains focus', async () => {
    const { kbRef } = renderDualMultiSelectInput({ items: threeItems });
    await flush();
    expect(kbRef.current!.focusCurrent().result?.id).toBe('select-a');
  });

  it('only focused MultiSelectInput responds to Space', async () => {
    const { stdin, onChangeA, onChangeB } =
      renderDualMultiSelectInput({ items: threeItems });

    await press(stdin, KEYS.space);
    expect(onChangeA).toHaveBeenCalledTimes(1);
    expect(onChangeB).not.toHaveBeenCalled();
  });

  it('after focusSet switches focus, keys affect new target', async () => {
    const { stdin, onChangeA, onChangeB, kbRef } =
      renderDualMultiSelectInput({ items: threeItems });

    kbRef.current!.focusSet('select-b');
    expect(kbRef.current!.focusCurrent().result?.id).toBe('select-b');

    await press(stdin, KEYS.space);
    expect(onChangeB).toHaveBeenCalledTimes(1);
    expect(onChangeA).not.toHaveBeenCalled();
  });

  it('after focus switches, previously focused component no longer responds', async () => {
    const { stdin, onChangeA, onChangeB, kbRef } =
      renderDualMultiSelectInput({ items: threeItems });

    await press(stdin, KEYS.space);
    expect(onChangeA).toHaveBeenCalledWith(['dark']);

    kbRef.current!.focusSet('select-b');

    onChangeA.mockClear();
    onChangeB.mockClear();

    await press(stdin, KEYS.space);
    expect(onChangeA).not.toHaveBeenCalled();
    expect(onChangeB).toHaveBeenCalledWith(['dark']);
  });

  it('two MultiSelectInput maintain independent selection state', async () => {
    const { stdin, onChangeA, onChangeB, kbRef } =
      renderDualMultiSelectInput({ items: threeItems });

    await press(stdin, KEYS.space);
    expect(onChangeA).toHaveBeenCalledWith(['dark']);

    kbRef.current!.focusSet('select-b');
    await press(stdin, KEYS.space);
    expect(onChangeB).toHaveBeenCalledWith(['dark']);

    kbRef.current!.focusSet('select-a');
    onChangeA.mockClear();
    await press(stdin, KEYS.space);
    expect(onChangeA).toHaveBeenCalledWith([]);
  });
});

describe('controlled mode (selected prop)', () => {
  it('checkbox reflects selection when selected is passed', async () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
      selected: ['dark', 'cyberpunk'],
    });

    const output = lastFrameClean();
    const filled = (output.match(/\u25C9/g) || []).length;
    expect(filled).toBe(2);
  });

  it('all items unselected when empty array passed', async () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
      selected: [],
    });

    const output = lastFrameClean();
    expect(output).not.toContain('\u25C9');
  });
});

describe('defaultSelected', () => {
  it('defaultSelected sets initial selection', () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: threeItems,
      defaultSelected: ['light'],
    });

    const output = lastFrameClean();
    const filled = (output.match(/\u25C9/g) || []).length;
    expect(filled).toBe(1);
  });
});

describe('empty list', () => {
  it('arrow keys do not throw on empty list', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: [],
      onChange,
    });

    await expect(press(stdin, KEYS.down)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.up)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.space)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('number keys do not throw on empty list', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: [],
      onChange,
    });

    await expect(press(stdin, '1')).resolves.not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('custom limit value', () => {
  it('shows only 3 items when limit=3', async () => {
    const { lastFrameClean } = renderControlled({
      focusId: 'test',
      items: longItems,
      limit: 3,
    });

    await flush();

    const output = lastFrameClean();
    expect(output).toContain('Item 01');
    expect(output).toContain('Item 02');
    expect(output).toContain('Item 03');
    expect(output).not.toContain('Item 04');
  });

  it('number keys bind only 1-3 when limit=3', async () => {
    const onChange = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
      limit: 3,
      onChange,
    });

    await press(stdin, '3');
    expect(onChange).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    await press(stdin, '4');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('scrolls down when limit=3, window moves', async () => {
    const { lastFrameClean, stdin } = renderControlled({
      focusId: 'test',
      items: longItems,
      limit: 3,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);

    const output = lastFrameClean();
    expect(output).not.toContain('Item 01');
    expect(output).toContain('Item 04');
  });
});

describe('initialIndex', () => {
  it('highlight starts at 2nd item when initialIndex=1', async () => {
    const onHighlight = vi.fn();
    const { stdin } = renderControlled({
      focusId: 'test',
      items: threeItems,
      initialIndex: 1,
      onHighlight,
    });

    expect(onHighlight).toHaveBeenCalledWith(threeItems[1]);

    // press Space to confirm highlighted item is actionable
    await press(stdin, KEYS.space);
  });
});

describe('dynamic items', () => {
  it('renders new items after dynamic growth', async () => {
    let setItems!: (items: Item<string>[]) => void;

    const initialItems: Item<string>[] = [{ label: 'A', value: 'a' }];

    function HostScreen() {
      const [items, _setItems] = useState(initialItems);
      setItems = _setItems;
      const [sel, setSel] = useState<string[]>([]);
      return React.createElement(MultiSelectInput, {
        focusId: 'test',
        items,
        selected: sel,
        onChange: setSel,
      } as any);
    }
    HostScreen.displayName = 'GrowHost';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { lastFrame, stdin } = render(
      React.createElement(
        ScenarioManagementProvider as any,
        { defaultScreen: HostScreen },
        React.createElement(KeyboardProvider, null, React.createElement(CurrentScreen)),
      ),
    );

    await flush();

    setItems([
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ]);

    await press(stdin, KEYS.down);

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('C');
  });
});

describe('component unmount cleanup', () => {
  it('keys do not trigger onChange after leaving screen', async () => {
    const { stdin, onChange, lastFrameClean } =
      renderNavigableMultiSelect(threeItems);

    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, 's');
    expect(lastFrameClean()).toContain('Dark');

    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenCalledWith(['dark']);

    onChange.mockClear();
    await press(stdin, 'b');
    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, KEYS.space);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('re-entering screen reinitializes MultiSelectInput correctly', async () => {
    const { stdin, onChange } = renderNavigableMultiSelect(threeItems);

    await press(stdin, 's');
    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenCalledWith(['dark']);

    await press(stdin, 'b');
    await press(stdin, 's');

    onChange.mockClear();
    await press(stdin, KEYS.space);
    expect(onChange).toHaveBeenCalledWith(['dark']);
  });
});

describe('unfocused rendering (isFocused=false)', () => {
  it('unfocused MultiSelectInput does not show ❯ indicator', async () => {
    const { lastFrameClean, kbRef, stdin } =
      renderDualMultiSelectInput({ items: threeItems });

    await press(stdin, KEYS.down);

    const output = lastFrameClean();
    const count = (output.match(/\u276F/g) || []).length;
    expect(count).toBe(1);

    kbRef.current!.focusSet('select-b');
    await press(stdin, KEYS.down);

    const output2 = lastFrameClean();
    const count2 = (output2.match(/\u276F/g) || []).length;
    expect(count2).toBe(1);
  });

  it('checkboxes still show selection when unfocused', async () => {
    const { lastFrameClean, stdin, kbRef } =
      renderDualMultiSelectInput({ items: threeItems });

    await press(stdin, KEYS.space);

    kbRef.current!.focusSet('select-b');

    const output = lastFrameClean();
    expect(output).toContain('\u25C9');
  });
});
