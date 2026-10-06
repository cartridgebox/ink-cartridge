import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act, useCallback, useEffect, useState } from "react";
import { Text, render as inkRender } from "ink";
import {
  registerComponent,
  clearRegistry,
} from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";
import { useKeyboard } from "../../src/keyboard/hook.js";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";

/**
 * mouseOptions stability — an inline `mouseOptions={{ ... }}` prop is a new
 * object on every render. The provider must rebuild the Mouse only when an
 * option VALUE changes, not when the object identity does: a rebuild writes
 * the terminal's mouse-off/mouse-on sequences again and resets the Mouse's
 * hover / drag state.
 */

class CountingStdout extends EventEmitter {
  isTTY = true;
  writes: string[] = [];
  get columns() {
    return 100;
  }
  get rows() {
    return 30;
  }
  write = (frame: string) => {
    this.writes.push(frame);
    return true;
  };
}

/** Mock stdin serving both Ink (readable + read) and xterm-mouse ('data'). */
class MockStdin extends EventEmitter {
  isTTY = true;
  private data: string | Buffer | null = null;
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read = () => {
    const { data } = this;
    this.data = null;
    return data;
  };
  write = (data: string | Buffer) => {
    this.data = data;
    this.emit("readable");
    this.emit("data", data);
  };
}

let stdout: CountingStdout;
let stdin: MockStdin;

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

async function press(ch: string): Promise<void> {
  await act(async () => {
    stdin.write(ch);
  });
  await flush();
}

/** How many times the terminal's mouse-tracking mode was switched on. */
function mouseOnWrites(): number {
  return stdout.writes.filter((w) => w.includes("\u001b[?1000h")).length;
}

function Screen() {
  return <Text>page</Text>;
}

function KeyDriver({
  onRerender,
  onChangeOption,
}: {
  onRerender: () => void;
  onChangeOption: () => void;
}) {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    const unbindT = boundKeyboard(["t"], onRerender);
    const unbindC = boundKeyboard(["c"], onChangeOption);
    return () => {
      unbindT();
      unbindC();
    };
  }, [boundKeyboard, onRerender, onChangeOption]);
  return null;
}

function App() {
  const [, setN] = useState(0);
  const [threshold, setThreshold] = useState(1);
  const onRerender = useCallback(() => setN((n) => n + 1), []);
  const onChangeOption = useCallback(() => setThreshold((t) => t + 1), []);
  return (
    <ScenarioManagementProvider defaultScreen={Screen} fullScreen>
      <KeyboardProvider
        mouse
        mouseOptions={{
          clickDistanceThreshold: threshold,
          inputStream: stdin as unknown as ReadableStreamWithEncoding,
          outputStream: stdout as unknown as NodeJS.WriteStream,
        }}
      >
        <KeyDriver onRerender={onRerender} onChangeOption={onChangeOption} />
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>
  );
}

function renderApp() {
  return inkRender(<App />, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
  });
}

beforeEach(() => {
  clearRegistry();
  clearDispatchers();
  registerComponent(Screen, {});
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // xterm-mouse's support check reads process streams, not the mocks.
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  stdout = new CountingStdout();
  stdin = new MockStdin();
});

afterEach(() => {
  delete (process.stdin as { isTTY?: boolean }).isTTY;
  delete (process.stdout as { isTTY?: boolean }).isTTY;
});

describe("mouseOptions stability", () => {
  it("keeps the Mouse alive when an inline options object is re-created", async () => {
    const app = renderApp();
    await flush();
    expect(mouseOnWrites()).toBe(1);

    // Unrelated re-renders re-create the inline object with the same values.
    await press("t");
    expect(mouseOnWrites()).toBe(1);
    await press("t");
    expect(mouseOnWrites()).toBe(1);

    app.unmount();
    app.cleanup();
  });

  it("rebuilds the Mouse when an option value actually changes", async () => {
    const app = renderApp();
    await flush();
    expect(mouseOnWrites()).toBe(1);

    await press("c"); // clickDistanceThreshold 1 -> 2
    expect(mouseOnWrites()).toBe(2);

    app.unmount();
    app.cleanup();
  });
});
