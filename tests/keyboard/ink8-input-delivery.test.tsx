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
  KeyboardProvider,
} from '../../src/keyboard/provider.js';
import { useKeyboard } from '../../src/keyboard/hook.js';

/** Every character the engine handed to a wildcard binding, in arrival order. */
const received: string[] = [];

/** Named-key hits (e.g. the up arrow), to prove escape sequences arrive. */
const namedHits: string[] = [];

/** Echoes wildcard input and records raw handoffs at the engine boundary. */
function RecordingApp() {
  const { boundKeyboard } = useKeyboard();
  const [text, setText] = useState('');
  useEffect(() => {
    const offWildcard = boundKeyboard(['*'], (input) => {
      received.push(input);
      setText((t) => t + input);
    });
    const offUp = boundKeyboard(['up'], () => {
      namedHits.push('up');
    });
    return () => {
      offWildcard();
      offUp();
    };
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
//
// Under Ink 8 the filter is therefore inert on the hot path — the drop happens
// inside Ink before it reaches `useInput` — and is retained only as a
// compatibility shim for the `ink >=5` peer range (Ink 5-7). Its own logic is
// unit-tested in base/mouse-report-filter.test.ts, and the tracking-on path is
// exercised end-to-end by mouse-filter-integration.test.tsx.
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
    received.length = 0;
    namedHits.length = 0;
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

  it('delivers escape sequences but not SGR mouse reports', async () => {
    const { stdin, lastFrame, unmount } = renderApp();

    // Control: an up-arrow escape sequence reaches the pipeline, proving the
    // harness delivers escape sequences and the negative case below is not
    // vacuous.
    await act(async () => {
      stdin.write('\x1b[A');
    });
    await flush();
    expect(namedHits).toEqual(['up']);

    await act(async () => {
      stdin.write('\x1b[<0;20;5M'); // press report
    });
    await flush();
    await act(async () => {
      stdin.write('\x1b[<0;20;5m'); // release report
    });
    await flush();

    // The pipeline is live (the arrow fired above, and this key lands here),
    // yet neither mouse report surfaced as input.
    await act(async () => {
      stdin.write('b');
    });
    await flush();
    expect(received).toEqual(['b']);
    expect(lastFrame()).not.toContain('[<');

    unmount();
  });
});
