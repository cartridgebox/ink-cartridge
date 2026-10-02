import { stripAnsi, flush } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Text } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { Fold } from '../../src/Fold.js';

function renderFold(props?: {
  expanded?: boolean;
  onToggle?: () => void;
  preview?: React.ReactNode;
}) {
  function Host() {
    return (
      <Fold
        focusId="fold"
        label="Settings"
        expanded={props?.expanded}
        onToggle={props?.onToggle}
        preview={props?.preview}
      >
        <Text>Hidden content</Text>
      </Fold>
    );
  }

  clearRegistry();
  registerComponent(Host, {});
  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider defaultScreen={Host}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  return { lastFrame, lastFrameClear: () => stripAnsi(lastFrame() ?? ''), stdin, unmount };
}

beforeEach(() => clearRegistry());
afterEach(() => vi.restoreAllMocks());

describe('Fold', () => {
  it('collapsed state shows preview, not children', () => {
    const { lastFrameClear } = renderFold({ preview: <Text>Preview text</Text> });
    expect(lastFrameClear()).toContain('Settings');
    expect(lastFrameClear()).toContain('Preview text');
    expect(lastFrameClear()).not.toContain('Hidden content');
  });

  it('collapsed state shows label, not children', () => {
    const { lastFrameClear } = renderFold();
    expect(lastFrameClear()).toContain('Settings');
    expect(lastFrameClear()).not.toContain('Hidden content');
  });

  it('expanded state shows children', () => {
    const { lastFrameClear } = renderFold({ expanded: true });
    expect(lastFrameClear()).toContain('Settings');
    expect(lastFrameClear()).toContain('Hidden content');
  });

  it('Space toggles fold/expand', async () => {
    let expanded = false;
    const { stdin, lastFrameClear } = renderFold({
      expanded,
      onToggle: () => { expanded = !expanded; },
    });
    expect(lastFrameClear()).not.toContain('Hidden content');

    stdin.write(' ');
    await new Promise(r => setTimeout(r, 10));

    expect(expanded).toBe(true);
  });

  it('uncontrolled mode defaultExpanded=true initially expanded', () => {
    function Host() {
      return (
        <Fold focusId="fold" label="Test" defaultExpanded>
          <Text>Content inside</Text>
        </Fold>
      );
    }

    clearRegistry();
    registerComponent(Host, {});
    const { lastFrame } = render(
      <ScenarioManagementProvider defaultScreen={Host}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('Content inside');
  });
});
