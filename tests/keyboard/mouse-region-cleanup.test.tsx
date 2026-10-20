import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act, useState } from "react";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type { XtermMouseEvent } from "@cartridge-engine/keyboard-engine";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";
import { getEngine } from "../../src/keyboard/provider/KeyboardProvider.js";
import { useMouseRegion } from "../../src/keyboard/hook.js";
import { useScreenSystem } from "../../src/screen/hook.js";

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

/** A click at 1-based terminal coordinates, bypassing stdin entirely. */
function makeClick(x: number, y: number): XtermMouseEvent {
  return {
    x,
    y,
    button: "left",
    shift: false,
    alt: false,
    ctrl: false,
    raw: 0,
    data: "",
    protocol: "SGR",
    action: "click",
  };
}

// Opening the layer through the captured context keeps the test off stdin.
let openLayerFn: (() => void) | null = null;

function Page() {
  const { openLayer } = useScreenSystem();
  const [clicks, setClicks] = useState(0);
  const ref = useMouseRegion({ onClick: () => setClicks((n) => n + 1) });

  openLayerFn = () => openLayer("cleanup-layer", 1);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>clicks:{clicks}</Text>
    </Box>
  );
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

describe("useMouseRegion cleanup", () => {
  beforeEach(() => {
    openLayerFn = null;
    clearRegistry();
    registerComponent(Page, {});
  });

  afterEach(() => {
    currentApp?.unmount();
    currentApp = null;
    clearDispatchers();
  });

  it("keeps the region through a screen-state change and drops it on unmount", async () => {
    const app = renderApp();
    await flush();
    const engine = getEngine();

    // The region is registered and hit-tested.
    expect(engine.processMouseEvent(makeClick(2, 2))).toBe(true);
    await flush();
    expect(app.lastFrame()).toContain("clicks:1");

    // Opening a layer rebuilds the screen context, so the page re-renders
    // without remounting. The region must survive: its cleanup used to run on
    // the context's new identity, right after the render registered it.
    const openLayer = openLayerFn;
    if (!openLayer) throw new Error("Page did not render");
    await act(async () => {
      openLayer();
    });
    await flush();

    expect(engine.processMouseEvent(makeClick(2, 2))).toBe(true);
    await flush();
    expect(app.lastFrame()).toContain("clicks:2");

    // Unmounting still removes the region.
    await act(async () => {
      app.unmount();
    });
    currentApp = null;
    expect(engine.processMouseEvent(makeClick(2, 2))).toBe(false);
  });
});
