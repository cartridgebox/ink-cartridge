import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useEffect, useState } from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { registerComponent, clearRegistry } from '../../src/screen/registry.js';
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from '../../src/screen/provider.js';
import { CurrentScreen } from '../../src/screen/current-screen.js';
import {
  KeyboardProvider,
} from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';

/** App that echoes every wildcard character it receives. */
function EchoApp() {
  const { boundKeyboard } = useKeyboard();
  const [text, setText] = useState('');
  useEffect(() => {
    return boundKeyboard(['*'], (input) => setText((t) => t + input));
  }, [boundKeyboard]);
  return <Text>{text.length > 0 ? text : '(empty)'}</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe('mouse report filtering', () => {
  beforeEach(() => {
    clearRegistry();
    clearDispatchers();
    registerComponent(EchoApp, {});
    // The test stdin is not a TTY, so Mouse.isSupported() warns and disables
    // the mouse feed — irrelevant here, the filter keys off the `mouse` prop.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not print SGR mouse reports as text and still accepts typing', async () => {
    const { stdin, lastFrame, unmount } = render(
      <ScenarioManagementProvider defaultScreen={EchoApp} fullScreen>
        <KeyboardProvider autoTab={false} mouse>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );

    await act(async () => {
      stdin.write('\x1b[<0;20;5M'); // press report
    });
    await flush();
    expect(lastFrame()).not.toContain('[<0;20;5M');
    expect(lastFrame()).toContain('(empty)');

    await act(async () => {
      stdin.write('\x1b[<0;20;5m'); // release report
    });
    await flush();
    expect(lastFrame()).not.toContain('[<0;20;5m');

    await act(async () => {
      stdin.write('a'); // normal typing still works
    });
    await flush();
    expect(lastFrame()).toContain('a');

    unmount();
  });

  it('still accepts typing after a pasted [< fragment', async () => {
    const { stdin, lastFrame, unmount } = render(
      <ScenarioManagementProvider defaultScreen={EchoApp} fullScreen>
        <KeyboardProvider autoTab={false} mouse>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );

    // Pasted text that merely looks like the start of a mouse report: it is
    // swallowed, but it must not keep eating the keys that follow it.
    await act(async () => {
      stdin.write('[<3');
    });
    await flush();

    await act(async () => {
      stdin.write('a');
    });
    await flush();
    await act(async () => {
      stdin.write('b');
    });
    await flush();

    expect(lastFrame()).toContain('ab');

    unmount();
  });
});
