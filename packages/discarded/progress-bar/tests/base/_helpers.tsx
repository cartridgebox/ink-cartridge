import React from 'react';
import { render } from 'ink-testing-library';
import { vi } from 'vitest';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 10));
}

export async function press(
  stdin: { write: (data: string) => void },
  key: string,
): Promise<void> {
  stdin.write(key);
  await new Promise((r) => setTimeout(r, 10));
}

export const KEYS = {
  enter: '\r',
  escape: '\x1b',
  backspace: '\x7f',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  delete: '\x1b[3~',
  space: ' ',
} as const;

export function renderComponent<P extends Record<string, any>>(
  Component: React.ComponentType<P>,
  props?: P,
) {
  const rendered = render(<Component {...(props ?? ({} as P))} />);
  return {
    lastFrame: () => rendered.lastFrame(),
    lastFrameClean: () => stripAnsi(rendered.lastFrame() ?? ''),
    stdin: rendered.stdin,
    unmount: rendered.unmount,
  };
}

export function renderInApp(host: React.ComponentType<any>) {
  clearRegistry();
  registerComponent(host, {});
  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider defaultScreen={host}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  return {
    lastFrame: () => lastFrame(),
    lastFrameClean: () => stripAnsi(lastFrame() ?? ''),
    stdin,
    unmount,
  };
}
