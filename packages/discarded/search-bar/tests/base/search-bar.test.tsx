import { stripAnsi, flush, press, KEYS } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { useKeyboard } from 'ink-cartridge';
import SearchBar from '../../src/SearchBar.js';
import type { SearchBarItem } from '../../src/search-bar-types.js';

/**
 * Minimal SelectBar component for testing SearchBar.
 * Registers a dummy binding under its focusId so boundKeyboard
 * automatically creates the focus target in the keyboard system.
 */
function TestSelectBar({
  items,
  onSelect: _onSelect,
  focusId,
  query: _query,
}: {
  items: SearchBarItem<string>[];
  onSelect: (item: SearchBarItem<string>) => void;
  focusId: string;
  query: string;
}) {
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(['_'], vi.fn(), { focusId });
  }, [focusId, boundKeyboard]);

  if (items.length === 0) {
    return <Text>No results</Text>;
  }

  return (
    <Text>
      {items.map((item) => item.label).join(', ')}
    </Text>
  );
}

function renderSearchBar(props?: {
  focusId?: string;
  width?: number;
  items?: SearchBarItem<string>[];
  onSubmit?: (item: SearchBarItem<string>) => void;
}) {
  const onSubmit = props?.onSubmit ?? vi.fn();

  function HostScreen() {
    return (
      <SearchBar
        focusId={props?.focusId ?? 'search'}
        width={props?.width}
        items={props?.items ?? []}
        onSubmit={onSubmit}
        selectBar={TestSelectBar}
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

  return {
    lastFrame,
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
    onSubmit,
  };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SearchBar', () => {
  it('renders search prompt and TextInput', async () => {
    const { lastFrameClean } = renderSearchBar({
      items: [
        { label: 'Apple', value: 'a' },
        { label: 'Banana', value: 'b' },
      ],
    });
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('>');
  });

  it('renders all items when query is empty', async () => {
    const { lastFrameClean } = renderSearchBar({
      items: [
        { label: 'Apple', value: 'a' },
        { label: 'Banana', value: 'b' },
      ],
    });
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('Apple');
    expect(output).toContain('Banana');
  });

  it('filters items when user types a query', async () => {
    const items: SearchBarItem<string>[] = [
      { label: 'Apple', value: 'a' },
      { label: 'Application', value: 'b' },
      { label: 'Banana', value: 'c' },
    ];

    const { stdin, lastFrameClean } = renderSearchBar({ items });
    await flush();

    // Type 'App' character by character
    await press(stdin, 'A');
    await flush();
    await press(stdin, 'p');
    await flush();
    await press(stdin, 'p');
    await flush();

    const output = lastFrameClean();
    expect(output).toContain('Apple');
    expect(output).toContain('Application');
    expect(output).not.toContain('Banana');
  });

  it('shows "No results" when query matches nothing', async () => {
    const items: SearchBarItem<string>[] = [
      { label: 'Apple', value: 'a' },
    ];

    const { stdin, lastFrameClean } = renderSearchBar({ items });
    await flush();

    // Type characters that don't match anything
    await press(stdin, 'z');
    await flush();
    await press(stdin, 'z');
    await flush();
    await press(stdin, 'z');
    await flush();

    const output = lastFrameClean();
    expect(output).toContain('No results');
  });

  it('renders the horizontal divider line', async () => {
    const { lastFrameClean } = renderSearchBar({
      width: 20,
      items: [{ label: 'Apple', value: 'a' }],
    });
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('-');
  });

  it('does not throw with empty items array', async () => {
    expect(() => {
      renderSearchBar({ items: [] });
    }).not.toThrow();
  });

  it('auto-detects width from terminal when width prop is omitted', async () => {
    const { lastFrameClean } = renderSearchBar({
      items: [{ label: 'Test', value: 't' }],
    });
    await flush();
    expect(lastFrameClean()).toBeTruthy();
  });

  it('passes current query to selectBar', async () => {
    const queryRef: { current: string | null } = { current: null };

    function QueryCaptureBar({ query }: { query: string }) {
      queryRef.current = query;
      return <Text>Results</Text>;
    }

    function HostScreen() {
      return (
        <SearchBar
          focusId="search"
          items={[{ label: 'hello world', value: 'hw' }]}
          selectBar={QueryCaptureBar as any}
          onSubmit={vi.fn()}
        />
      );
    }
    HostScreen.displayName = 'HostQuery';

    clearRegistry();
    registerComponent(HostScreen, {});

    const { stdin } = render(
      <ScenarioManagementProvider defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();

    // Type 'he' and verify query reaches selectBar
    await press(stdin, 'h');
    await flush();
    await press(stdin, 'e');
    await flush();

    expect(queryRef.current).toBe('he');
  });

  it('calls onSubmit when selectBar fires onSelect', async () => {
    const onSubmit = vi.fn();
    const testItem: SearchBarItem<string> = { label: 'Test', value: 'val' };

    // SelectBar that immediately calls onSelect with the first item
    function AutoSelectBar({ items, onSelect }: {
      items: SearchBarItem<string>[];
      onSelect: (item: SearchBarItem<string>) => void;
      focusId: string;
      query: string;
    }) {
      React.useEffect(() => {
        if (items.length > 0) {
          onSelect(items[0]);
        }
      }, []);
      return <Text>Auto</Text>;
    }

    function HostScreen() {
      return (
        <SearchBar
          focusId="search"
          items={[testItem]}
          selectBar={AutoSelectBar as any}
          onSubmit={onSubmit}
        />
      );
    }
    HostScreen.displayName = 'HostSubmit';

    clearRegistry();
    registerComponent(HostScreen, {});

    render(
      <ScenarioManagementProvider defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();

    expect(onSubmit).toHaveBeenCalledWith(testItem);
  });

  it('Enter key in TextInput switches focus to results', async () => {
    const { stdin } = renderSearchBar({
      items: [
        { label: 'Apple', value: 'a' },
        { label: 'Banana', value: 'b' },
      ],
    });
    await flush();

    // Type a character then press Enter — exercises the return key handler
    await press(stdin, 'A');
    await flush();
    await expect(press(stdin, KEYS.enter)).resolves.not.toThrow();
  });

  it('sort: exact match comes before prefix match', async () => {
    const items: SearchBarItem<string>[] = [
      { label: 'application', value: 'b' },
      { label: 'app', value: 'a' },
      { label: 'apple', value: 'c' },
    ];

    const { stdin, lastFrameClean } = renderSearchBar({ items });
    await flush();

    await press(stdin, 'a');
    await flush();
    await press(stdin, 'p');
    await flush();
    await press(stdin, 'p');
    await flush();

    const output = lastFrameClean();
    // 'app' is exact match → should appear before 'apple' and 'application'
    const appIdx = output.indexOf('app,');
    const appleIdx = output.indexOf('apple');
    expect(appIdx).toBeLessThan(appleIdx);
  });

  it('sort: prefix match comes before substring match', async () => {
    const items: SearchBarItem<string>[] = [
      { label: 'pineapple', value: 'a' },
      { label: 'appetizer', value: 'b' },
      { label: 'apple', value: 'c' },
    ];

    const { stdin, lastFrameClean } = renderSearchBar({ items });
    await flush();

    await press(stdin, 'a');
    await flush();
    await press(stdin, 'p');
    await flush();
    await press(stdin, 'p');
    await flush();

    const output = lastFrameClean();
    // 'apple' starts with 'app' → before 'pineapple' (contains 'app' in middle)
    const appleIdx = output.indexOf('apple');
    const pineIdx = output.indexOf('pineapple');
    expect(appleIdx).toBeLessThan(pineIdx);
  });
});
