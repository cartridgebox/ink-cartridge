import { describe, it, expect, beforeEach } from "vitest";
import React, { act, useEffect } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";
import { useKeyboard } from "../../src/keyboard/hook.js";

/** Every invocation of the canonical `shift+s` binding. */
const hits: string[] = [];

/** Binds Shift+S under the key name the docs tell users to write. */
function ShiftLetterScreen() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(["shift+s"], () => {
      hits.push("shift+s");
    });
  }, [boundKeyboard]);
  return <Text>ready</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

function renderApp() {
  return render(
    <ScenarioManagementProvider defaultScreen={ShiftLetterScreen} fullScreen>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
}

beforeEach(() => {
  clearRegistry();
  clearDispatchers();
  hits.length = 0;
  registerComponent(ShiftLetterScreen, {});
});

describe("shift+letter key names", () => {
  it("fires the canonical lowercase binding for a real Shift+S press", async () => {
    const { stdin, unmount } = renderApp();
    await flush();

    // Ink's useInput reports Shift+S as input "S" with key.shift true; the
    // adapter must still address the documented lowercase key name.
    await act(async () => {
      stdin.write("S");
    });
    await flush();

    expect(hits).toEqual(["shift+s"]);
    unmount();
  });

  it("does not fire the shift binding for a plain lowercase s", async () => {
    const { stdin, unmount } = renderApp();
    await flush();

    await act(async () => {
      stdin.write("s");
    });
    await flush();

    expect(hits).toEqual([]);
    unmount();
  });
});
