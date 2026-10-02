import { stripAnsi, flush } from './_helpers.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { Box } from 'ink';
import { registerComponent, clearRegistry } from 'ink-cartridge';
import { ScenarioManagementProvider } from 'ink-cartridge';
import { CurrentScreen } from 'ink-cartridge';
import { KeyboardProvider } from 'ink-cartridge';
import { TextInput } from '@cartridge-engine/text-input';
import { Form } from '../../src/Form.js';
import { Field } from '../../src/Field.js';
import type { Validator } from '../../src/types.js';



const required: Validator = (v) => (v ? undefined : 'Required');
const minLength3: Validator = (v) =>
  v && String(v).length >= 3 ? undefined : 'Too short';

function renderForm(
  opts: {
    initialValues?: Record<string, any>;
    onSubmit?: (values: Record<string, any>) => void;
    onError?: (errors: Record<string, string | undefined>) => void;
  },
  fields: Array<{
    name: string;
    rules?: Validator[];
    defaultValue?: any;
  }>,
) {
  const onSubmit = opts.onSubmit ?? vi.fn();
  const onError = opts.onError ?? vi.fn();
  const submitRef: { current: (() => void) | undefined } = { current: undefined };

  function HostScreen() {
    return (
      <Form onSubmit={onSubmit} onError={onError} initialValues={opts.initialValues} submitRef={submitRef}>
        <Box flexDirection="column">
          {fields.map((f) => (
            <Field key={f.name} name={f.name} rules={f.rules} defaultValue={f.defaultValue}>
              {({ value, onChange, focusId }: any) => (
                <TextInput focusId={focusId} value={value} onChange={onChange} />
              )}
            </Field>
          ))}
        </Box>
      </Form>
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

  return { lastFrame, lastFrameClean: () => stripAnsi(lastFrame() ?? ''), stdin, unmount, onSubmit, onError, submitRef };
}

beforeEach(() => {
  clearRegistry();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Form — value initialization', () => {
  it.each([
    { source: 'initialValues', config: { initialValues: { email: 'a@b.c' } }, field: { name: 'email' }, expected: 'a@b.c' },
    { source: 'defaultValue', config: {}, field: { name: 'nickname', defaultValue: 'anon' }, expected: 'anon' },
  ])('value from $source renders correctly', async ({ config, field, expected }) => {
    const { lastFrameClean } = renderForm(config, [field]);
    await flush();
    await flush();
    expect(lastFrameClean()).toContain(expected);
  });

  it('multiple fields display independent values', async () => {
    const { lastFrameClean } = renderForm(
      { initialValues: { a: 'hello', b: 'world' } },
      [{ name: 'a' }, { name: 'b' }],
    );
    await flush();
    const output = lastFrameClean();
    expect(output).toContain('hello');
    expect(output).toContain('world');
  });
});

describe('Form — validation', () => {
  it('validation failure calls onError with field error', async () => {
    const onError = vi.fn();
    const onSubmit = vi.fn();
    const { submitRef } = renderForm(
      { onError, onSubmit },
      [{ name: 'name', rules: [required], defaultValue: '' }],
    );
    await flush();
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].name).toBeTruthy();
  });

  it('validation success calls onSubmit with all field values', async () => {
    const onSubmit = vi.fn();
    const { submitRef } = renderForm(
      { onSubmit, initialValues: { email: 'a@b.c', age: '25' } },
      [
        { name: 'email', rules: [required] },
        { name: 'age', rules: [required] },
      ],
    );
    await flush();
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.c', age: '25' });
  });

  it.each([
    { value: '', expectedError: 'Required', desc: 'first rule fails, stops' },
    { value: 'ab', expectedError: 'Too short', desc: 'first rule passes, second fails' },
  ])('rule ordering: $desc', async ({ value, expectedError }) => {
    const onError = vi.fn();
    const { submitRef } = renderForm(
      { onError, initialValues: { field: value } },
      [{ name: 'field', rules: [required, minLength3] }],
    );
    await flush();
    await flush();

    submitRef.current!();
    await flush();

    expect(onError.mock.calls[0][0].field).toBe(expectedError);
  });

  it('fix after validation failure → resubmit succeeds', async () => {
    const onSubmit = vi.fn();
    const { submitRef, stdin } = renderForm(
      { onSubmit },
      [{ name: 'email', rules: [required], defaultValue: '' }],
    );
    await flush();
    await flush();

    submitRef.current!();
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();

    stdin.write('x');
    await flush();

    submitRef.current!();
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'x' });
  });

  it('multi-field validation failure focuses first error field without throwing', async () => {
    const { submitRef } = renderForm(
      { initialValues: { email: '', password: '' } },
      [
        { name: 'email', rules: [required] },
        { name: 'password', rules: [required] },
      ],
    );
    await flush();
    await flush();

    expect(() => submitRef.current!()).not.toThrow();
  });
});

describe('Form — unmount safety', () => {
  it('submit after unmount does not trigger callbacks (mountedRef guard)', async () => {
    const onSubmit = vi.fn();
    const submitRef: { current: (() => void) | undefined } = { current: undefined };

    function HostScreen() {
      return (
        <Form onSubmit={onSubmit} submitRef={submitRef}>
          <Field name="x" rules={[]} defaultValue="">
            {({ value, onChange, focusId }: any) => (
              <TextInput focusId={focusId} value={value} onChange={onChange} />
            )}
          </Field>
        </Form>
      );
    }
    HostScreen.displayName = 'HostScreen';

    clearRegistry();
    registerComponent(HostScreen, {});
    const { unmount } = render(
      <ScenarioManagementProvider  defaultScreen={HostScreen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();
    await flush();

    expect(submitRef.current).toBeDefined();

    unmount();
    await flush();

    expect(() => submitRef.current!()).not.toThrow();
  });
});
