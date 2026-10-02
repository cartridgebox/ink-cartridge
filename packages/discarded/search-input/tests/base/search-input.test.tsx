import { stripAnsi, flush, press } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { SearchInput } from '../../src/SearchInput.js';

const KEYS = {
  escape: '\x1b',
} as const;

function renderSearchInput(props: {
  focusId: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  onSubmit?: (v: string) => void;
}) {
  const onChange = props.onChange ?? vi.fn();
  const onSubmit = props.onSubmit ?? vi.fn();

  function HostScreen() {
    return (
      <SearchInput
        focusId={props.focusId}
        value={props.value ?? ''}
        onChange={onChange}
        placeholder={props.placeholder}
        onSubmit={onSubmit}
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

  return { lastFrame, lastFrameClean: () => stripAnsi(lastFrame() ?? ''), stdin, unmount, onChange, onSubmit };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SearchInput', () => {
  it('renders placeholder when value is empty', async () => {
    const { lastFrameClean } = renderSearchInput({
      focusId: 'search',
      value: '',
      placeholder: 'Search...',
    });
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('Search');
  });

  it('shows text and ╳ when value is set', async () => {
    const { lastFrameClean } = renderSearchInput({
      focusId: 'search',
      value: 'hello',
    });
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('hello');
    expect(output).toContain('╳');
  });

  it('Esc clears value', async () => {
    const onChange = vi.fn();
    const { stdin } = renderSearchInput({
      focusId: 'search',
      value: 'hello',
      onChange,
    });
    await flush();

    await press(stdin, KEYS.escape);
    await flush();

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('Esc does not throw when value is empty', async () => {
    const onChange = vi.fn();
    const { stdin } = renderSearchInput({
      focusId: 'search',
      value: '',
      onChange,
    });
    await flush();

    await press(stdin, KEYS.escape);
    await flush();

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('unmount cleanup handles focusId change without error', async () => {
    const onChange = vi.fn();

    function DynamicSearchHost() {
      const [fid, setFid] = useState('search-a');
      useEffect(() => {
        const timer = setTimeout(() => setFid('search-b'), 5);
        return () => clearTimeout(timer);
      }, []);
      return (
        <SearchInput
          focusId={fid}
          value=""
          onChange={onChange}
        />
      );
    }
    DynamicSearchHost.displayName = 'DynamicSearchHost';

    clearRegistry();
    registerComponent(DynamicSearchHost, {});

    const { stdin } = render(
      <ScenarioManagementProvider defaultScreen={DynamicSearchHost}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();
    await flush(); // Allow focusId change to propagate

    await expect(press(stdin, 'x')).resolves.not.toThrow();
  });

  it('unmount triggers cleanup without error', async () => {
    const onChange = vi.fn();

    function ToggleHost() {
      const [show] = useState(true);
      return show
        ? <SearchInput focusId="search" value="hello" onChange={onChange} />
        : <Text>Gone</Text>;
    }
    ToggleHost.displayName = 'ToggleHost';

    clearRegistry();
    registerComponent(ToggleHost, {});

    const { unmount } = render(
      <ScenarioManagementProvider defaultScreen={ToggleHost}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();

    expect(() => unmount()).not.toThrow();
  });
});
