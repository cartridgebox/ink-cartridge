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
import { SelectRow } from '../../src/select-row/SelectRow.js';
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

function renderSelectRow(props: {
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
      <SelectRow
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

function renderDualSelectRow(props: { items: Item<string>[] }) {
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
        <SelectRow
          focusId="row-a"
          items={props.items}
          onSelect={onSelectA}
        />
        <SelectRow
          focusId="row-b"
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

function renderNavigableSelectRow(items: Item<string>[]) {
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
      <SelectRow
        focusId="settings-row"
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
    const { lastFrameClean } = renderSelectRow({
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
  it('right arrow moves highlight to next item, Enter selects correct item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('left arrow moves highlight to previous item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('left arrow at far left does not overflow, selection stays at item 0', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });

  it('right arrow at far right does not overflow, selection stays at last item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('h moves highlight left (vim-style key)', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, 'h');
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('l moves highlight right (vim-style key)', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, 'l');
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });
});

// 3. selection confirmation

describe('selection confirmation', () => {
  it('Enter selects item 0 by default', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
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
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('onSelect receives full Item object (with label, value)', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
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
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '1');
    expect(onSelect).toHaveBeenCalledWith(threeItems[0]);
  });

  it('press 2 selects 2nd visible item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '2');
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);
  });

  it('press 3 selects 3rd visible item', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      onSelect,
    });

    await press(stdin, '3');
    expect(onSelect).toHaveBeenCalledWith(threeItems[2]);
  });

  it('number key exceeding visible items does not trigger onSelect', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
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
    const { lastFrameClean } = renderSelectRow({
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

  it('auto-scrolls when highlight moves right past window, new items appear', async () => {
    const { lastFrameClean, stdin } = renderSelectRow({
      focusId: 'test',
      items: longItems,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.right);
    }

    const output = lastFrameClean();
    expect(output).not.toContain('Item 01');
    expect(output).toContain('Item 11');
    expect(output).toContain('Item 02');
    expect(output).toContain('Item 10');
  });

  it('auto-scrolls left when highlight moves past window, old items reappear', async () => {
    const { lastFrameClean, stdin } = renderSelectRow({
      focusId: 'test',
      items: longItems,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.right);
    }
    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.left);
    }

    const output = lastFrameClean();
    expect(output).toContain('Item 01');
    expect(output).not.toContain('Item 11');
  });

  it('number key after scroll selects Nth item in window, not global Nth', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: longItems,
      onSelect,
    });

    for (let i = 0; i < 10; i++) {
      await press(stdin, KEYS.right);
    }

    await press(stdin, '1');

    const calledWith = onSelect.mock.calls[0][0] as Item<string>;
    expect(calledWith).not.toEqual(longItems[0]);
  });

  it('Enter after scroll selects highlighted item, not fixed item 0', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: longItems,
      onSelect,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);

    expect(onSelect).toHaveBeenCalledWith(longItems[3]);
  });
});

// 6. focus system

describe('focus system', () => {
  it('first registered SelectRow automatically gains focus', async () => {
    const { kbRef } = renderDualSelectRow({ items: threeItems });

    await flush();

    expect(kbRef.current!.focusCurrent().result?.id).toBe('row-a');
  });

  it('only focused SelectRow responds to keys', async () => {
    const { stdin, onSelectA, onSelectB } = renderDualSelectRow({
      items: threeItems,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);

    expect(onSelectA).toHaveBeenCalledTimes(1);
    expect(onSelectB).not.toHaveBeenCalled();
  });

  it('after focusSet switches focus, keys affect new target', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectRow({
      items: threeItems,
    });

    kbRef.current!.focusSet('row-b');
    expect(kbRef.current!.focusCurrent().result?.id).toBe('row-b');

    await press(stdin, KEYS.enter);
    expect(onSelectB).toHaveBeenCalledTimes(1);
    expect(onSelectA).not.toHaveBeenCalled();
    expect(onSelectB).toHaveBeenCalledWith(threeItems[0]);
  });

  it('after focus switches, previously focused component no longer responds', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectRow({
      items: threeItems,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);
    expect(onSelectA).toHaveBeenCalledWith(threeItems[1]);

    kbRef.current!.focusSet('row-b');

    onSelectA.mockClear();
    onSelectB.mockClear();
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);
    expect(onSelectA).not.toHaveBeenCalled();
    expect(onSelectB).toHaveBeenCalledTimes(1);
  });

  it('two SelectRow maintain independent selection state', async () => {
    const { stdin, onSelectA, onSelectB, kbRef } = renderDualSelectRow({
      items: threeItems,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);
    expect(onSelectA).toHaveBeenCalledWith(threeItems[2]);

    onSelectA.mockClear();
    kbRef.current!.focusSet('row-b');
    await press(stdin, KEYS.enter);
    expect(onSelectB).toHaveBeenCalledWith(threeItems[0]);
  });
});

// 7. custom rendering

describe('custom rendering', () => {
  const DotIndicator = ({ isSelected }: { isSelected: boolean }) => (
    <Box marginTop={1}>
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
    const { lastFrameClean } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      indicatorComponent: DotIndicator,
    });

    await flush();

    const output = lastFrameClean();
    expect(output).toContain('*');
    expect(output).not.toContain('●');
  });

  it('custom item renders with different styles for selected vs unselected', async () => {
    const { lastFrameClean, stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      itemComponent: CustomItem,
    });

    await press(stdin, KEYS.right);

    const output = lastFrameClean();
    expect(output).toContain('[>]');
    expect(output).toContain('[ ]');
  });

  it('custom indicator + item work together', async () => {
    const { lastFrameClean, stdin } = renderSelectRow({
      focusId: 'test',
      items: threeItems,
      indicatorComponent: DotIndicator,
      itemComponent: CustomItem,
    });

    await press(stdin, KEYS.right);

    const output = lastFrameClean();
    expect(output).toContain('*');
    expect(output).toContain('[>]');
    expect(output).not.toContain('●');
  });
});

// 8. empty list

describe('empty list', () => {
  it('items=[] does not throw and renders normally', () => {
    expect(() => {
      renderSelectRow({ focusId: 'test', items: [] });
    }).not.toThrow();
  });

  it('arrow keys do not throw on empty list', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'test',
      items: [],
      onSelect,
    });

    await expect(press(stdin, KEYS.right)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.left)).resolves.not.toThrow();
    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('number keys do not throw on empty list', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
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
    const { lastFrameClean } = renderSelectRow({
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
    const { stdin } = renderSelectRow({
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

  it('scrolls right when limit=3, window moves', async () => {
    const { lastFrameClean, stdin } = renderSelectRow({
      focusId: 'test',
      items: longItems,
      limit: 3,
    });

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);

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
        <SelectRow focusId="test" items={items} onSelect={vi.fn()} />
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

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);

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
        <SelectRow focusId="test" items={items} onSelect={vi.fn()} />
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

    await flush();

    setItems([
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
      { label: 'C', value: 'c' },
    ]);

    await press(stdin, KEYS.right);

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
      renderNavigableSelectRow(threeItems);

    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, 's');
    expect(lastFrameClean()).toContain('Dark');

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.enter);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(threeItems[1]);

    onSelect.mockClear();
    await press(stdin, 'b');
    expect(lastFrameClean()).toContain('Menu');

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.enter);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-entering screen reinitializes SelectRow correctly', async () => {
    const { stdin, onSelect, lastFrameClean } =
      renderNavigableSelectRow(threeItems);

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
  it('unfocused SelectRow does not show ● indicator', async () => {
    const { lastFrameClean, kbRef, stdin } = renderDualSelectRow({
      items: threeItems,
    });

    await press(stdin, KEYS.right);

    const output = lastFrameClean();
    const count = (output.match(/●/g) || []).length;
    expect(count).toBe(1);

    kbRef.current!.focusSet('row-b');

    await press(stdin, KEYS.right);

    const output2 = lastFrameClean();
    const count2 = (output2.match(/●/g) || []).length;
    expect(count2).toBe(1);
  });

  it('after focus switch, new target shows ●, old target hides ●', async () => {
    const { lastFrameClean, kbRef, stdin } = renderDualSelectRow({
      items: threeItems,
    });

    await press(stdin, KEYS.right);

    const before = lastFrameClean();
    const beforeCount = (before.match(/●/g) || []).length;
    expect(beforeCount).toBe(1);

    kbRef.current!.focusSet('row-b');

    await press(stdin, KEYS.right);

    const after = lastFrameClean();
    const afterCount = (after.match(/●/g) || []).length;
    expect(afterCount).toBe(1);
  });
});

describe('focus target stability', () => {
  it('continuous scrolling does not cause focus target loss', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderSelectRow({
      focusId: 'scroll-focus',
      items: [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ],
      onSelect,
    });
    await flush();

    await press(stdin, KEYS.right);
    await press(stdin, KEYS.right);
    await press(stdin, KEYS.left);
    await press(stdin, KEYS.right);

    await press(stdin, KEYS.enter);
    await flush();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
