import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act, useEffect, useState } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";
import { useFocusState, useKeyboard } from "../../src/keyboard/hook.js";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

// Captured handles let the test re-render the probe with another focusId and
// move focus without going through stdin.
let setProbeFocusId: ((id: string) => void) | null = null;
let focusSetFn: ((id: string) => boolean) | null = null;

function Probe({ focusId }: { focusId: string }) {
  const focused = useFocusState(focusId);
  return <Text>focused:{String(focused)}</Text>;
}

function Page() {
  const { boundKeyboard, focusSet } = useKeyboard();
  const [probeFocusId, setFocusId] = useState("one");

  useEffect(() => {
    const unbindOne = boundKeyboard(["a"], () => {}, { focusId: "one" });
    const unbindTwo = boundKeyboard(["b"], () => {}, { focusId: "two" });
    return () => {
      unbindOne();
      unbindTwo();
    };
  }, []);

  setProbeFocusId = setFocusId;
  focusSetFn = focusSet;

  return <Probe focusId={probeFocusId} />;
}

let currentApp: ReturnType<typeof render> | null = null;

function renderApp() {
  currentApp = render(
    <ScenarioManagementProvider defaultScreen={Page}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  return currentApp;
}

describe("useFocusState", () => {
  beforeEach(() => {
    setProbeFocusId = null;
    focusSetFn = null;
    clearRegistry();
    registerComponent(Page, {});
  });

  afterEach(() => {
    currentApp?.unmount();
    currentApp = null;
    clearDispatchers();
  });

  it("follows a changed focusId without waiting for a focus event", async () => {
    const app = renderApp();
    await flush();
    expect(app.lastFrame()).toContain("focused:true");

    const setFocusId = setProbeFocusId;
    const focusSet = focusSetFn;
    if (!setFocusId || !focusSet) throw new Error("Page did not render");

    // Same instance, different target; focus has not moved.
    await act(async () => {
      setFocusId("two");
    });
    await flush();
    expect(app.lastFrame()).toContain("focused:false");

    // A real focus change still reaches the probe.
    await act(async () => {
      focusSet("two");
    });
    await flush();
    expect(app.lastFrame()).toContain("focused:true");

    // Switching the parameter back is reflected immediately as well.
    await act(async () => {
      setFocusId("one");
    });
    await flush();
    expect(app.lastFrame()).toContain("focused:false");
  });
});
