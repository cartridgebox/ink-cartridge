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
import { SelectInput } from '../../src/select/SelectInput.js';
import type { Item } from '../../src/select/types.js';

const KEYS = {
  enter: '\r',
  escape: '\x1b',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
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

function renderSelectInput(props: {
  focusId: string;
  items: Item<string>[];
  onSelect?: (item: Item<string>) => void;
  itemComponent?: React.ComponentType<Item<string> & { isSelected: boolean }>;
  indicatorComponent?: React.ComponentType<{ isSelected: boolean }>;
  limit?: number;
}) {
  const onSelect = props.onSelect ?? vi.fn();

  function HostScreen() {
    return (
      <SelectInput
        focusId={props.focusId}
        items={props.items}
        onSelect={onSelect}
        itemComponent={props.itemComponent}
        indicatorComponent={props.indicatorComponent}
        limit={props.limit}
      />
    );
  }
  HostScreen.displayName = 'HostScreen';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider  defaultScreen={HostScreen}>
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
    onSelect,
  };
}

function renderDualSelectInput(props: { items: Item<string>[] }) {
  const onSelectA = vi.fn();
  const onSelectB = vi.fn();
  const kbRef: { current: ReturnType<typeof useKeyboard> | null } = {
    current: null,
  };

  function HostScreen() {
    const kb = useKeyboard();
    useEffect(() => {
      kbRef.current = kb;
    }, [kb]);

    return (
      <Box flexDirection="column">
        <SelectInput
          focusId="select-a"
          items={props.items}
          onSelect={onSelectA}
        />
        <SelectInput
          focusId="select-b"
          items={props.items}
          onSelect={onSelectB}
        />
      </Box>
    );
  }
  HostScreen.displayName = 'DualHostScreen';

  clearRegistry();
  registerComponent(HostScreen, {});

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider  defaultScreen={HostScreen}>
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
    onSelectA,
    onSelectB,
    kbRef,
  };
}

function renderNavigableSelectInput(items: Item<string>[]) {
  const onSelect = vi.fn();

  function Menu() {
    const sc = useScreenSystem();
    const { boundKeyboard } = useKeyboard();
    useEffect(() => {
      boundKeyboard(['s'], () => sc.skip(Settings, {}));
    }, []);
    return <Text>Menu - Press S to Settings</Text>;
  }
  Menu.displayName = 'Menu';

  function Settings() {
    const sc = useScreenSystem();
    const { boundKeyboard } = useKeyboard();
    useEffect(() => {
      boundKeyboard(['b'], () => sc.back());
    }, []);
    return (
      <SelectInput
        focusId="settings-select"
        items={items}
        onSelect={onSelect}
      />
    );
  }
  Settings.displayName = 'Settings';

  clearRegistry();
  registerComponent(Menu, {});
  registerComponent(Settings, {}, { parent: Menu });

  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider  defaultScreen={Menu}>
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
    onSelect,
  };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 1. basic rendering

describe('basic rendering', () => {
  it('renders all item labels', () => {
    const { lastFrameClean } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
    });

    const output = lastFrameClean();
    expect(output).toContain('Dark');
    expect(output).toContain('Light');
    expect(output).toContain('Cyberpunk');
  });


});

// 2. keyboard navigation

describe('keyboard navigation', () => {
  it('down arrow moves highlight to next item, Enter selects correct item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('up arrow moves highlight to previous item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('up arrow at top does not overflow, selection stays at item 0', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.up);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });

  it('down arrow at bottom does not overflow, selection stays at last item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });
});

// 3. selection confirmation

describe('selection confirmation', () => {
  it('Enter selects item 0 by default', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });

  it('Enter after navigating to item 3 passes correct item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('onSelect receives full Item object (with label, value)', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.enter);

    const received = onSelect.mock.calls[0][0];
    expect(received).toEqual({ label: 'Dark', value: 'dark' });
  });
});

// 4. number shortcuts

describe('number shortcuts', () => {
  it('press 1 selects 1st visible item (which is item 0)', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '1');
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });

  it('press 2 selects 2nd visible item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '2');
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('press 3 selects 3rd visible item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '3');
    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('number key exceeding visible items does not trigger onSelect', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '4');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// 5. scrolling

describe('scrolling (items > limit)', () => {
  it('renders at most 10 items when items exceed default limit=10', async () => {
    const { lastFrameClean } = renderSelectInput({
      focusId: 'test',
      items: longItems,
    });

    await flush();

    const output = lastFrameClean();
    expect(output).toContain('Item 01');
    expect(output).toContain('Item 10');
    expect(output).not.toContain('Item 11');
    expect(output).not.toContain('Item 15');
  });

  it('auto-scrolls when highlight moves past window, new items appear', async () => {
    const { lastFrameClean, stdin } = renderSelectInput({
      focusId: 'test',
      items: longItems,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.down);
    }

    const output = lastFrameClean();
    expect(output).not.toContain('Item 01');
    expect(output).toContain('Item 11');
    expect(output).toContain('Item 02');
    expect(output).toContain('Item 10');
  });

  it('auto-scrolls up when highlight moves past window, old items reappear', async () => {
    const { lastFrameClean, stdin } = renderSelectInput({
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

  it('number key after scroll selects Nth item in window, not global Nth', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: longItems,
      onSelect,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.down);
    }

    await press(stdin, '1');

    const calledWith = onSelect.mock.calls[0][0] as Item<string>;
    expect(calledWith).not.toEqual(longItems[0]);
  });

  it('Enter after scroll selects highlighted item, not fixed item 0', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: longItems,
      onSelect,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(longItems[3]);
  });
});

// 6. focus system

describe('focus system', () => {
  it('first registered SelectInput automatically gains focus', async () => {
    const { kbRef } = renderDualSelectInput({ items: threeItems });

    await flush();

    expect(kbRef.current!.focusCurrent().result?.id).toBe('select-a');
  });

  it('only focused SelectInput responds to keys', async () => {
    const { stdin, onSelectA, onSelectB } = renderDualSelectInput({
      items: threeItems,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);

    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(onSelectB).not.toHaveBeenCalled();
  });

  it('after focusSet switches focus, keys affect new target', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectInput({
      items: threeItems,
    });

    kbRef.current!.focusSet('select-b');
    expect(kbRef.current!.focusCurrent().result?.id).toBe('select-b');

    await press(stdin, KEYS.enter);
    expect(onSelectB).toHaveBeenCalledTimes(1);
    expect(onSelectA).not.toHaveBeenCalled();
    expect(onSelectB).toHaveBeenCalledWith(threeItems[0]);
  });

  it('after focus switches, previously focused component no longer responds', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectInput({
      items: threeItems,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);
    expect(onSelectA).toHaveBeenCalledWith(threeItems[1]);

    kbRef.current!.focusSet('select-b');

    onSelectA.mockClear();
    onSelectB.mockClear();
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);
    expect(onSelectA).not.toHaveBeenCalled();
    expect(onSelectB).toHaveBeenCalledTimes(1);
  });

  it('two SelectInput maintain independent selection state', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectInput({
      items: threeItems,
    });

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);
    expect(onSelectA).toHaveBeenCalledWith(threeItems[2]);

    onSelectA.mockClear();
    kbRef.current!.focusSet('select-b');
    await press(stdin, KEYS.enter);
    expect(onSelectB).toHaveBeenCalledWith(threeItems[0]);
  });
});

// 7. custom rendering

describe('custom rendering', () => {
  const StarIndicator = ({ isSelected }: { isSelected: boolean }) => (
    <Box marginRight={1}>
      {isSelected ? <Text color="yellow">*</Text> : <Text> </Text>}
    </Box>
  );

  const CustomItem = ({
    label,
    isSelected,
  }: Item<string> & { isSelected: boolean }) => (
    <Text color={isSelected ? 'greenBright' : 'grey'}>
      {isSelected ? `[>] ${label}` : `[ ] ${label}`}
    </Text>
  );

  it('custom indicator renders correctly', async () => {
    const { lastFrameClean } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      indicatorComponent: StarIndicator,
    });

    await flush();

    const output = lastFrameClean();
    expect(output).toContain('*');
    expect(output).not.toContain('\u276F');
  });

  it('custom item renders with different styles for selected vs unselected', async () => {
    const { lastFrameClean, stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      itemComponent: CustomItem,
    });

    // press key to ensure effects have run and focus is registered
    await press(stdin, KEYS.down);

    const output = lastFrameClean();
    // after down, second item selected → [>]
    expect(output).toContain('[>]');
    // remaining unselected → [ ]
    expect(output).toContain('[ ]');
  });

  it('custom indicator + item work together', async () => {
    const { lastFrameClean, stdin } = renderSelectInput({
      focusId: 'test',
      items: threeItems,
      indicatorComponent: StarIndicator,
      itemComponent: CustomItem,
    });

    // press key to ensure effects have run and focus is registered
    await press(stdin, KEYS.down);

    const output = lastFrameClean();
    expect(output).toContain('*');
    expect(output).toContain('[>]');
    expect(output).not.toContain('\u276F');
  });
});

// 8. empty list

describe('empty list', () => {
  it('items=[] does not throw and renders normally', () => {
    expect(() => {
      renderSelectInput({ focusId: 'test', items: [] });
    }).not.toThrow();
  });

  it('arrow keys do not throw on empty list', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: [],
      onSelect,
    });

    await expect(press(stdin, KEYS.down)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.up)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('number keys do not throw on empty list', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: [],
      onSelect,
    });

    await expect(press(stdin, '1')).resolves.not.toThrow();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// 9. custom limit value

describe('custom limit value', () => {
  it('shows only 3 items when limit=3', async () => {
    const { lastFrameClean } = renderSelectInput({
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
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'test',
      items: longItems,
      limit: 3,
      onSelect,
    });

    await press(stdin, '3');
    expect(onSelect).toHaveBeenCalledWith(longItems[2]);

    onSelect.mockClear();
    await press(stdin, '4');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('scrolls down when limit=3, window moves', async () => {
    const { lastFrameClean, stdin } = renderSelectInput({
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

// 10. dynamic items

describe('dynamic items', () => {
  it('selectedIndex auto-corrects when items shrink, no overflow', async () => {
    let setItems!: (items: Item<string>[]) => void;

    function HostScreen() {
      const [items, _setItems] = useState(threeItems);
      setItems = _setItems;
      return (
        <SelectInput focusId="test" items={items} onSelect={vi.fn()} />
      );
    }
    HostScreen.displayName = 'DynamicHost';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { lastFrame, stdin } = render(
      <ScenarioManagementProvider  defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);

    expect(() => setItems([{ label: 'Only', value: 'only' }])).not.toThrow();

    await flush();

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('Only');
    expect(output).not.toContain('Dark');
    expect(output).not.toContain('Light');
    expect(output).not.toContain('Cyberpunk');
  });

  it('renders new items after dynamic growth', async () => {
    let setItems!: (items: Item<string>[]) => void;

    const initialItems: Item<string>[] = [{ label: 'A', value: 'a' }];

    function HostScreen() {
      const [items, _setItems] = useState(initialItems);
      setItems = _setItems;
      return (
        <SelectInput focusId="test" items={items} onSelect={vi.fn()} />
      );
    }
    HostScreen.displayName = 'GrowHost';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { lastFrame, stdin } = render(
      <ScenarioManagementProvider  defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );

    // wait for effects to run and focus to register
    await flush();

    setItems([
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ]);

    // send a key press to ensure render cycle completes
    await press(stdin, KEYS.down);

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('A');
    expect(output).toContain('B');
    expect(output).toContain('C');
  });
});

// 11. component unmount cleanup

describe('component unmount cleanup', () => {
  it('keys do not trigger onSelect after leaving screen', async () => {
    const { stdin, onSelect, lastFrameClean } =
      renderNavigableSelectInput(threeItems);

    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, 's');
    expect(lastFrameClean()).toContain('Dark');

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.enter);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);

    onSelect.mockClear();
    await press(stdin, 'b');
    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, KEYS.down);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.enter);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-entering screen reinitializes SelectInput correctly', async () => {
    const { stdin, onSelect, lastFrameClean } =
      renderNavigableSelectInput(threeItems);

    await press(stdin, 's');
    await press(stdin, KEYS.enter);
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);

    await press(stdin, 'b');
    await press(stdin, 's');

    onSelect.mockClear();
    await press(stdin, KEYS.enter);
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });
});

// 12. unfocused rendering

describe('unfocused rendering (isFocused=false)', () => {
  it('unfocused SelectInput does not show ▶ indicator', async () => {
    const { lastFrameClean, kbRef, stdin } = renderDualSelectInput({
      items: threeItems,
    });

    // press key to ensure effects have run
    await press(stdin, KEYS.down);

    const output = lastFrameClean();
    const count = (output.match(/\u276F/g) || []).length;
    expect(count).toBe(1);

    kbRef.current!.focusSet('select-b');

    // press key to confirm re-render completed
    await press(stdin, KEYS.down);

    const output2 = lastFrameClean();
    const count2 = (output2.match(/\u276F/g) || []).length;
    expect(count2).toBe(1);
  });

  it('after focus switch, new target shows ▶, old target hides ▶', async () => {
    const { lastFrameClean, kbRef, stdin } = renderDualSelectInput({
      items: threeItems,
    });

    // press key to ensure effects have run
    await press(stdin, KEYS.down);

    const before = lastFrameClean();
    const beforeCount = (before.match(/\u276F/g) || []).length;
    expect(beforeCount).toBe(1);

    kbRef.current!.focusSet('select-b');

    // press key to confirm re-render completed
    await press(stdin, KEYS.down);

    const after = lastFrameClean();
    const afterCount = (after.match(/\u276F/g) || []).length;
    expect(afterCount).toBe(1);
  });
});

describe('focus target stability', () => {
  it('continuous scrolling does not cause focus target loss', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectInput({
      focusId: 'scroll-focus',
      items: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      onSelect,
    });
    await flush();

    // move up and down multiple times
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.down);
    await press(stdin, KEYS.up);
    await press(stdin, KEYS.down);

    // Enter still selects normally
    await press(stdin, KEYS.enter);
    await flush();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
