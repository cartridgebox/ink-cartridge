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
import { useKeyboard } from "../../src/keyboard/hook.js";
import { getEngine } from "../../src/keyboard/provider/KeyboardProvider.js";

function Field({ id }: { id: string }) {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    const unbind = boundKeyboard(["i"], () => {}, {
      focusId: { group: "form", focusId: id },
    });
    return unbind;
  }, [id, boundKeyboard]);
  return <Text>field {id}</Text>;
}

let toggle: ((show: boolean) => void) | null = null;

function Screen() {
  const [show, setShow] = useState(true);
  toggle = setShow;
  return show ? <Field id="name" /> : <Text>gone</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

describe("KeyboardProvider releaseFocusWhenEmpty", () => {
  beforeEach(() => {
    clearRegistry();
    registerComponent(Screen, {});
  });

  afterEach(() => {
    clearDispatchers();
  });

  it("adds and drops the group's focus as its last holder mounts and unmounts", async () => {
    const { unmount } = render(
      <ScenarioManagementProvider defaultScreen={Screen}>
        <KeyboardProvider releaseFocusWhenEmpty>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();
    expect(getEngine().focusCurrent("form").result?.id).toBe("name");

    await act(async () => {
      toggle?.(false);
    });
    await flush();
    expect(getEngine().focusCurrent("form").noFound).toBe(true);

    await act(async () => {
      toggle?.(true);
    });
    await flush();
    expect(getEngine().focusCurrent("form").result?.id).toBe("name");

    unmount();
  });

  it("keeps the target registered when the option is off", async () => {
    const { unmount } = render(
      <ScenarioManagementProvider defaultScreen={Screen}>
        <KeyboardProvider>
          <CurrentScreen />
        </KeyboardProvider>
      </ScenarioManagementProvider>,
    );
    await flush();
    expect(getEngine().focusCurrent("form").result?.id).toBe("name");

    await act(async () => {
      toggle?.(false);
    });
    await flush();
    expect(getEngine().focusCurrent("form").result?.id).toBe("name");

    unmount();
  });
});
