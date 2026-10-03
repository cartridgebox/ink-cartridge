import { describe, it, expect, beforeEach } from 'vitest';
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
  clearShortcutOperations,
  KeyboardProvider,
} from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';

/** Every input the engine handed to a wildcard binding, in arrival order. */
const received: string[] = [];

/** Echoes wildcard input and records the raw handoff at the engine boundary. */
function RecordingApp() {
  const { boundKeyboard } = useKeyboard();
  const [text, setText] = useState('');
  useEffect(() => {
    return boundKeyboard(['*'], (input) => {
      received.push(input);
      setText((t) => t + input);
    });
  }, [boundKeyboard]);
  return <Text>{text.length > 0 ? text : '(empty)'}</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

// Mouse tracking is intentionally off: the built-in MouseReportFilter only
// runs when it is on, so these cases isolate what Ink itself hands to
// `useInput` — the behaviour Ink 8 changed (unrecognised control sequences
// are now dropped at the source instead of arriving as stripped text).
function renderApp() {
  return render(
    <ScenarioManagementProvider defaultScreen={RecordingApp} fullScreen>
      <KeyboardProvider autoTab={false}>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
}

describe('input delivery under Ink 8', () => {
  beforeEach(() => {
    clearRegistry();
    clearDispatchers();
    clearShortcutOperations();
    received.length = 0;
    registerComponent(RecordingApp, {});
  });

  it('delivers a plain keypress to a bound handler', async () => {
    const { stdin, lastFrame, unmount } = renderApp();

    await act(async () => {
      stdin.write('a');
    });
    await flush();

    expect(received).toEqual(['a']);
    expect(lastFrame()).toContain('a');

    unmount();
  });

  it('never hands SGR mouse reports to the keyboard pipeline', async () => {
    const { stdin, lastFrame, unmount } = renderApp();

    await act(async () => {
      stdin.write('\x1b[<0;20;5M'); // press report
    });
    await flush();
    await act(async () => {
      stdin.write('\x1b[<0;20;5m'); // release report
    });
    await flush();

    expect(received).toEqual([]);
    expect(lastFrame()).toContain('(empty)');

    unmount();
  });
});
