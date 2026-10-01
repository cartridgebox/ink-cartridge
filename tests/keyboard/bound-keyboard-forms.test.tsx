import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import {
  clearShortcutOperations,
  KeyboardProvider,
} from "../../src/keyboard/provider.js";
import { useKeyboard } from "../../src/keyboard/hook.js";

/**
 * The `useKeyboard()` wrapper exposes three `boundKeyboard` calling forms
 * (mirroring the engine): explicit keys + handler, explicit keys + action id,
 * and action id alone (the action's preset keys). These tests pin the two
 * action-id forms, which route through the wrapper's overload dispatch.
 */

const handlers = {
  actionForm: vi.fn(),
  keysActionForm: vi.fn(),
};

/** Form 3: boundKeyboard(actionId) — binds the action's preset keys. */
function ActionForm() {
  const kb = useKeyboard();
  useEffect(() => {
    kb.addAction({ actionId: "act", action: handlers.actionForm, keys: ["g"] });
    return kb.boundKeyboard("act");
  }, [kb]);
  return <Text>action-form</Text>;
}

/** Form 2: boundKeyboard(keys, actionId) — explicit keys, action by id. */
function KeysActionForm() {
  const kb = useKeyboard();
  useEffect(() => {
    kb.addAction({
      actionId: "act2",
      action: handlers.keysActionForm,
      keys: ["g"],
    });
    return kb.boundKeyboard(["x"], "act2");
  }, [kb]);
  return <Text>keys-action-form</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

async function pressKey(
  stdin: { write: (data: string) => void },
  key: string,
): Promise<void> {
  await act(async () => {
    stdin.write(key);
  });
}

let unmount: (() => void) | null = null;

function renderApp(screen: React.ComponentType) {
  const app = render(
    <ScenarioManagementProvider defaultScreen={screen}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  unmount = app.unmount;
  return app;
}

describe("useKeyboard() boundKeyboard calling forms", () => {
  beforeEach(() => {
    clearRegistry();
    registerComponent(ActionForm, {});
    registerComponent(KeysActionForm, {});
  });

  afterEach(() => {
    unmount?.();
    unmount = null;
    clearDispatchers();
    clearShortcutOperations();
    vi.clearAllMocks();
  });

  it("throws a helpful error when used outside a KeyboardProvider", () => {
    let caught: unknown = null;
    function Rogue() {
      try {
        useKeyboard();
      } catch (err) {
        caught = err;
      }
      return <Text>rogue</Text>;
    }
    render(<Rogue />);
    expect(String(caught)).toMatch(/must be called inside a <KeyboardProvider>/);
  });

  it("boundKeyboard(actionId) binds the action's preset keys", async () => {
    const app = renderApp(ActionForm);
    await flush();

    await pressKey(app.stdin, "g");
    expect(handlers.actionForm).toHaveBeenCalledTimes(1);

    // A key the action does not list stays unbound.
    await pressKey(app.stdin, "x");
    expect(handlers.actionForm).toHaveBeenCalledTimes(1);
  });

  it("boundKeyboard(keys, actionId) uses the explicit keys, not the preset", async () => {
    const app = renderApp(KeysActionForm);
    await flush();

    await pressKey(app.stdin, "x");
    expect(handlers.keysActionForm).toHaveBeenCalledTimes(1);

    // The action's own preset key is overridden by the explicit keys.
    await pressKey(app.stdin, "g");
    expect(handlers.keysActionForm).toHaveBeenCalledTimes(1);
  });
});
