import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act, useCallback, useEffect, useState } from "react";
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
import { useScreenSystem } from "../../src/screen/hook.js";

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

// The layer renders in a full-screen absolute box, so both indicators cannot
// be read off one frame; the values each component rendered are captured here
// instead.
let lastPageWaiting: boolean | null = null;
let lastLayerWaiting: boolean | null = null;

/**
 * `currentScreenHasSequenceWaiting()` reports the caller's own scope. The page
 * below asks through the same hook as the layer element, and the element's
 * owner sits on top of the owner stack — so without `useKeyboard` re-pushing
 * the caller's owner, the page would read the layer's pending sequence.
 */
function Page() {
  const { openLayer, applyElement } = useScreenSystem();
  const { boundSequence, currentScreenHasSequenceWaiting } = useKeyboard();
  const [, setTick] = useState(0);
  const sync = useCallback(() => setTick((t) => t + 1), []);

  // One-time setup: the page's own sequence plus a layer element with one of
  // its own. Empty deps on purpose — the wrapped methods change identity when
  // the screen state changes, and re-running this would re-apply the element.
  useEffect(() => {
    const unbind = boundSequence(["p", "p"], () => {});
    openLayer("scope-layer", 1);
    applyElement("scope-layer", {
      element: LayerElement,
      elementId: "scope-element",
    });
    return unbind;
  }, []);

  lastPageWaiting = currentScreenHasSequenceWaiting(sync);
  return <Text>page:{String(lastPageWaiting)}</Text>;
}

function LayerElement() {
  const { boundSequence, currentScreenHasSequenceWaiting } = useKeyboard();
  const [, setTick] = useState(0);
  const sync = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => boundSequence(["l", "l"], () => {}), []);

  lastLayerWaiting = currentScreenHasSequenceWaiting(sync);
  return <Text>layer:{String(lastLayerWaiting)}</Text>;
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

describe("currentScreenHasSequenceWaiting owner scope", () => {
  beforeEach(() => {
    clearRegistry();
    registerComponent(Page, {});
    registerComponent(LayerElement, {});
  });

  afterEach(() => {
    currentApp?.unmount();
    currentApp = null;
    clearDispatchers();
  });

  it("reports the caller's own scope, not the owner on top of the stack", async () => {
    const app = renderApp();
    await flush();

    // Arm the layer's sequence. Only the layer may report it, even though its
    // owner sits on top of the page's.
    await pressKey(app.stdin, "l");
    await flush();
    expect(lastLayerWaiting).toBe(true);
    expect(lastPageWaiting).toBe(false);

    // The page's own sequence takes over for the page's call; the layer's was
    // broken by the same key falling through.
    await pressKey(app.stdin, "p");
    await flush();
    expect(lastPageWaiting).toBe(true);
    expect(lastLayerWaiting).toBe(false);
  });
});
