import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act, useContext, useEffect } from "react";
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
import { useScreenSystem } from "../../src/screen/hook.js";
import { LayerElementContext } from "../../src/screen/LayerElementContext.js";

let focusNextString: (() => boolean) | null = null;
let focusNextObject: (() => boolean) | null = null;
let focusSetString: ((focusId: string) => boolean) | null = null;

/**
 * A layer element that owns a named focus group. `useFocusState` with the
 * string group shorthand is the assertion vehicle: before the fix it always
 * reported false because `withFocusOptions` dropped the element id.
 */
function GroupElement() {
  const ctx = useContext(LayerElementContext);
  const { boundKeyboard, focusNext, focusSet } = useKeyboard();
  const stringFocused = useFocusState("second", "form");
  const objectFocused = useFocusState("second", { group: "form" });

  useEffect(() => {
    if (!ctx) return;
    const unbindFirst = boundKeyboard(["1"], () => {}, {
      elementId: ctx.id,
      focusId: { group: "form", focusId: "first" },
    });
    const unbindSecond = boundKeyboard(["2"], () => {}, {
      elementId: ctx.id,
      focusId: { group: "form", focusId: "second" },
    });
    focusNextString = () => focusNext("form");
    focusNextObject = () => focusNext({ group: "form" });
    focusSetString = (focusId) => focusSet(focusId, "form");
    return () => {
      unbindFirst();
      unbindSecond();
    };
  }, [boundKeyboard, ctx, focusNext, focusSet]);

  return (
    <Text>
      string:{String(stringFocused)} object:{String(objectFocused)}
    </Text>
  );
}

function Demo() {
  const { openLayer, applyElement } = useScreenSystem();
  useEffect(() => {
    openLayer("focus-group-layer", 10);
    applyElement("focus-group-layer", {
      elementId: "group-element",
      element: GroupElement,
    });
  }, [applyElement, openLayer]);
  return <Text>Demo</Text>;
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

let unmountApp: (() => void) | null = null;

function renderApp() {
  const app = render(
    <ScenarioManagementProvider defaultScreen={Demo}>
      <KeyboardProvider>
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  unmountApp = app.unmount;
  return app;
}

describe("focus group string shorthand inside a layer element", () => {
  beforeEach(() => {
    focusNextString = null;
    focusNextObject = null;
    focusSetString = null;
    clearRegistry();
    registerComponent(Demo, {});
  });

  afterEach(() => {
    unmountApp?.();
    unmountApp = null;
    clearDispatchers();
  });

  it("moves focus with focusNext('form')", async () => {
    const app = renderApp();
    await flush();
    expect(app.lastFrame()).toContain("string:false");

    await act(async () => {
      focusNextString?.();
    });
    await flush();
    expect(app.lastFrame()).toContain("string:true");
  });

  it("focuses a target with focusSet('second', 'form')", async () => {
    const app = renderApp();
    await flush();
    expect(app.lastFrame()).toContain("string:false");

    await act(async () => {
      focusSetString?.("second");
    });
    await flush();
    expect(app.lastFrame()).toContain("string:true");
  });

  it("keeps the object form working", async () => {
    const app = renderApp();
    await flush();
    expect(app.lastFrame()).toContain("object:false");

    await act(async () => {
      focusNextObject?.();
    });
    await flush();
    expect(app.lastFrame()).toContain("object:true");
  });
});
