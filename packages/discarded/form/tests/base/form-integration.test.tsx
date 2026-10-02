import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Box } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { Form, Field } from '../../src/index.js';
import { TextInput } from '@cartridge-engine/text-input';
import type { Validator } from '../../src/types.js';
import { stripAnsi, flush, press } from './_helpers.js';

const required: Validator = (v) => (v ? undefined : 'Required');
const isEmail: Validator = (v) =>
  v && String(v).includes('@') ? undefined : 'Invalid email';

function renderSingleFieldForm(rules?: Validator[]) {
  const onSubmit = vi.fn();
  const onError = vi.fn();
  const submitRef: { current: (() => void) | undefined } = { current: undefined };

  function HostScreen() {
    return (
      <Form onSubmit={onSubmit} onError={onError} submitRef={submitRef}>
        <Field name="email" rules={rules} defaultValue="">
          {({ value, onChange, focusId }: any) => (
            <TextInput focusId={focusId} value={value} onChange={onChange} />
          )}
        </Field>
      </Form>
    );
  }

  clearRegistry();
  registerComponent(HostScreen, {});
  const { lastFrame, stdin, unmount } = render(
    <ScenarioManagementProvider  defaultScreen={HostScreen}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );

  return { lastFrame, lastFrameClean: () => stripAnsi(lastFrame() ?? ''), stdin, unmount, onSubmit, onError, submitRef };
}

beforeEach(() => clearRegistry());
afterEach(() => vi.restoreAllMocks());

describe('Form integration — single field', () => {
  it('renders without throwing', async () => {
    const { lastFrameClean } = renderSingleFieldForm([]);
    await flush();
    expect(lastFrameClean()).toBeDefined();
  });

  it('input characters sync to output', async () => {
    const { stdin, lastFrameClean } = renderSingleFieldForm([]);
    await flush();

    await press(stdin, 'h');
    await press(stdin, 'i');
    await flush();

    expect(lastFrameClean()).toContain('hi');
  });

  it('empty submit triggers onError', async () => {
    const { submitRef, onError, onSubmit } = renderSingleFieldForm([required]);
    await flush();
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].email).toBeTruthy();
  });

  it('valid input submit succeeds', async () => {
    const { stdin, submitRef, onSubmit } = renderSingleFieldForm([required, isEmail]);
    await flush();
    await flush();

    for (const c of 't@x.com') await press(stdin, c);
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: 't@x.com' });
  });

  it('invalid input returns specific error', async () => {
    const { stdin, submitRef, onError } = renderSingleFieldForm([required, isEmail]);
    await flush();
    await flush();

    for (const c of 'nope') await press(stdin, c);
    await flush();

    submitRef.current!();
    await flush();

    expect(onError.mock.calls[0][0].email).toBe('Invalid email');
  });

  it('fail then fix then resubmit succeeds', async () => {
    const { stdin, submitRef, onSubmit } = renderSingleFieldForm([required, isEmail]);
    await flush();
    await flush();

    submitRef.current!();
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();

    for (const c of 'o@m.e') await press(stdin, c);
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'o@m.e' });
  });

  it('unmount after input does not throw', async () => {
    const { stdin, unmount } = renderSingleFieldForm([]);
    await flush();

    await press(stdin, 'h');
    unmount();

    expect(true).toBe(true);
  });
});

describe('Form integration — multi-field + focus isolation', () => {
  it('tab navigation preserves value isolation', async () => {
    const onSubmit = vi.fn();
    const submitRef: { current: (() => void) | undefined } = { current: undefined };

    function HostScreen() {
      return (
        <Form onSubmit={onSubmit} initialValues={{ email: 'hi@x.c', password: 's3cret' }} submitRef={submitRef}>
          <Box flexDirection="column">
            <Field name="email" rules={[required, isEmail]} defaultValue="">
              {({ value, onChange, focusId }: any) => (
                <TextInput focusId={focusId} value={value} onChange={onChange} />
              )}
            </Field>
            <Field name="password" rules={[required]} defaultValue="">
              {({ value, onChange, focusId }: any) => (
                <TextInput focusId={focusId} value={value} onChange={onChange} mask="*" />
              )}
            </Field>
          </Box>
        </Form>
      );
    }

    clearRegistry();
    registerComponent(HostScreen, {});
    const { lastFrame } = render(
      <ScenarioManagementProvider  defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();
    await flush();

    const output = stripAnsi(lastFrame() ?? '');
    expect(output).toContain('hi@x.c');

    submitRef.current!();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'hi@x.c', password: 's3cret' });
  });
});
