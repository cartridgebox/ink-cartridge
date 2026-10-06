import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect, useState, type ComponentType } from "react";
import { Box, Text, render as inkRender } from "ink";
import {
  registerComponent,
  clearRegistry,
} from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import {
  KeyboardProvider,
} from "../../src/keyboard/provider.js";
import {
  useKeyboard,
  useMouseRegion,
} from "../../src/keyboard/hook.js";
import { useScreenSystem } from "../../src/screen/hook.js";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";

/**
 * clickOnRise integration tests — clicking a mouse region whose hook was
 * configured with `{ clickOnRise: true }` raises the surrounding regular
 * layer above all other layers (bringLayerToFront), which re-routes the
 * whole keyboard pipeline: plain bindings, focus-scoped bindings,
 * sequences, stop barriers, and penetration keys all follow the new layer
 * order.
 *
 * Keyboard input flows through Ink's readable-stream pattern (write → queue →
 * emit 'readable' → read()); mouse input flows through the xterm-mouse fork's
 * 'data' listener on the same mock stream. SGR sequences: press
 * `\x1b[<0;x;yM` + release `\x1b[<0;x;ym` synthesize a click.
 *
 * Layout: every layer box is absolutely positioned full-screen, and the
 * elements inside position their regions absolutely too. The low layer's
 * region spans columns 1..20, the high layer's region columns 24..43 — so a
 * click at (5,2) hits the low layer and (33,2) the high one. While a modal is
 * open it owns all hit-testing, so the same (5,2) click reaches the modal.
 */

class ResizableStdout extends EventEmitter {
  isTTY = true;
  frames: string[] = [];
  get columns() {
    return 100;
  }
  get rows() {
    return 30;
  }
  write = (frame: string) => {
    this.frames.push(frame);
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

/** Mouse enable sequences must not pollute the frame assertions. */
const silentMouseOutput = { write: () => {} };

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

function lastFrameText(): string {
  // eslint-disable-next-line no-control-regex
  const ansi = new RegExp("\\x1b\\[[0-9;]*m", "g");
  return (stdout.frames.at(-1) ?? "")
    .replace(ansi, "")
    .replace(/\s+/g, " ");
}

let stdout: ResizableStdout;
let stdin: MockStdin;

const lowKey = vi.fn();
const highKey = vi.fn();
const lowFocusKey = vi.fn();
const lowSeq = vi.fn();

beforeEach(() => {
  clearRegistry();
  clearDispatchers();
  lowKey.mockClear();
  highKey.mockClear();
  lowFocusKey.mockClear();
  lowSeq.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // xterm-mouse's support check reads process streams, not the mocks.
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  stdout = new ResizableStdout();
  stdin = new MockStdin();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (process.stdin as { isTTY?: boolean }).isTTY;
  delete (process.stdout as { isTTY?: boolean }).isTTY;
});

function renderApp(Screen: ComponentType<any>): { unmount: () => void } {
  registerComponent(Screen, {});
  const instance = inkRender(
    <ScenarioManagementProvider defaultScreen={Screen} fullScreen>
      <KeyboardProvider
        autoTab={false}
        mouse
        mouseOptions={{
          inputStream: stdin as unknown as ReadableStreamWithEncoding,
          outputStream: silentMouseOutput as unknown as NodeJS.WriteStream,
        }}
      >
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );
  return {
    unmount: () => {
      instance.unmount();
      instance.cleanup();
    },
  };
}

async function press(ch: string): Promise<void> {
  await act(async () => {
    stdin.write(ch);
  });
  await flush();
}

async function click(x: number, y: number): Promise<void> {
  await act(async () => {
    stdin.write(`\x1b[<0;${x};${y}M`);
    stdin.write(`\x1b[<0;${x};${y}m`);
  });
  await flush();
}

/* ------------------------------------------------------------------ */
/* App: low layer (clickOnRise) under a high layer                     */
/*                                                                     */
/* Keyboard bindings per layer element:                                */
/*   LowEl:  x → lowKey, f → lowFocusKey (focusId "lf"),               */
/*           sequence g g → lowSeq, stop s, penetration p              */
/*   HighEl: x / g / s / p / f → highKey                               */
/* The layers open on mount — the element regions are hit-tested after */
/* the first flush, so tests click after settling.                     */
/* ------------------------------------------------------------------ */

function LowEl() {
  const { boundKeyboard, boundSequence, stop, penetration } = useKeyboard();
  const [clicks, setClicks] = useState(0);
  const ref = useMouseRegion(
    { onClick: () => setClicks((c) => c + 1) },
    { clickOnRise: true },
  );

  useEffect(() => {
    const unbindX = boundKeyboard(["x"], lowKey);
    const unbindF = boundKeyboard(["f"], lowFocusKey, { focusId: "lf" });
    const unbindSeq = boundSequence(["g", "g"], lowSeq);
    const unstop = stop(["s"]);
    const unpenetrate = penetration(["p"]);
    return () => {
      unbindX();
      unbindF();
      unbindSeq();
      unstop();
      unpenetrate();
    };
  }, [boundKeyboard, boundSequence, stop, penetration]);

  return (
    <Box ref={ref} position="absolute" top={0} left={0} width={20} height={3}>
      <Text>Low c{clicks}</Text>
    </Box>
  );
}

function HighEl() {
  const { boundKeyboard } = useKeyboard();
  const ref = useMouseRegion({});

  useEffect(() => {
    const unbindX = boundKeyboard(["x"], highKey);
    const unbindG = boundKeyboard(["g"], highKey);
    const unbindS = boundKeyboard(["s"], highKey);
    const unbindP = boundKeyboard(["p"], highKey);
    const unbindF = boundKeyboard(["f"], highKey);
    return () => {
      unbindX();
      unbindG();
      unbindS();
      unbindP();
      unbindF();
    };
  }, [boundKeyboard]);

  return (
    <Box ref={ref} position="absolute" top={0} left={23} width={20} height={3}>
      <Text>High</Text>
    </Box>
  );
}

function ModalEl() {
  const { boundKeyboard } = useKeyboard();
  const { closeModalLayer } = useScreenSystem();
  const [modalClicks, setModalClicks] = useState(0);
  const ref = useMouseRegion({
    onClick: () => setModalClicks((c) => c + 1),
  });

  useEffect(() => {
    return boundKeyboard(["q"], () => closeModalLayer("m"));
  }, [boundKeyboard, closeModalLayer]);

  return (
    <Box
      ref={ref}
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
    >
      {/* Rendered below the top-left corner so it never overlaps the
          "Low cN" text both regions render at (1,1). */}
      <Box position="absolute" top={10} left={0}>
        <Text>Modal c{modalClicks}</Text>
      </Box>
    </Box>
  );
}

function ClickRiseScreen() {
  const {
    openLayer,
    applyElement,
    openModalLayer,
    applyElementToModalLayer,
  } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    openLayer("low", 1);
    applyElement("low", { elementId: "low-el", element: LowEl });
    openLayer("high", 2);
    applyElement("high", { elementId: "high-el", element: HighEl });

    const openModal = boundKeyboard(["m"], () => {
      openModalLayer("m", 100);
      applyElementToModalLayer("m", { elementId: "m-el", element: ModalEl });
    });
    return openModal;
  }, [
    applyElement,
    applyElementToModalLayer,
    boundKeyboard,
    openLayer,
    openModalLayer,
  ]);

  return <Text>page</Text>;
}

/** Open both layers and raise the low one — the common setup for the
 *  keyboard-routing assertions that follow. */
async function mountAndRaiseLow() {
  const app = renderApp(ClickRiseScreen);
  await flush();
  await click(5, 2);
  expect(lastFrameText()).toContain("Low c1");
  return app;
}

describe("clickOnRise", () => {
  it("clicking a region raises its regular layer above the others", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // The high layer owns the 'x' key while it is on top.
    await press("x");
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowKey).not.toHaveBeenCalled();

    // Click the low layer's region (columns 1..20) — the click rises it.
    await click(5, 2);
    expect(lastFrameText()).toContain("Low c1");

    // The raised layer now owns the 'x' key.
    await press("x");
    expect(lowKey).toHaveBeenCalledTimes(1);
    expect(highKey).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("keeps the layer in place when it is already on top (no zIndex drift)", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    await click(5, 2);
    await press("x");
    expect(lowKey).toHaveBeenCalledTimes(1);

    // Second click: already the top layer — no-op. The element kept its
    // state (c2, not c1), proving it was never remounted.
    await click(5, 2);
    expect(lastFrameText()).toContain("Low c2");

    await press("x");
    expect(lowKey).toHaveBeenCalledTimes(2);
    expect(highKey).not.toHaveBeenCalled();

    unmount();
  });

  it("does nothing while a modal layer is open", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    await press("m");
    await flush();

    // The modal owns all hit-testing: the same click reaches the modal, not
    // the low layer underneath.
    await click(5, 2);
    expect(lastFrameText()).toContain("Low c0");
    expect(lastFrameText()).toContain("Modal c1");

    await press("q");
    await flush();

    // The low layer was never raised — the high layer still owns 'x'.
    await press("x");
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowKey).not.toHaveBeenCalled();

    unmount();
  });

  it("re-routes a focus-scoped binding to the raised layer", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // The high layer owns 'f' while on top.
    await press("f");
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowFocusKey).not.toHaveBeenCalled();

    await click(5, 2);
    await press("f");
    expect(lowFocusKey).toHaveBeenCalledTimes(1);
    expect(highKey).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("lets the raised layer start its multi-key sequence", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // 'g' is consumed by the high layer, so the low layer's g-g sequence
    // never starts.
    await press("g");
    await press("g");
    expect(highKey).toHaveBeenCalledTimes(2);
    expect(lowSeq).not.toHaveBeenCalled();

    await click(5, 2);
    await press("g");
    await press("g");
    expect(lowSeq).toHaveBeenCalledTimes(1);
    expect(highKey).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("turns the raised layer's stop barrier into the topmost barrier", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // Below the high layer, the low layer's stop('s') never sees the key.
    await press("s");
    expect(highKey).toHaveBeenCalledTimes(1);

    await click(5, 2);
    await press("s");
    // The raised low layer now stops 's' before it can reach the high layer.
    expect(highKey).toHaveBeenCalledTimes(1);

    unmount();
  });

  it("keeps penetration transparent after the raise", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // Before the raise the high layer handles 'p' anyway.
    await press("p");
    expect(highKey).toHaveBeenCalledTimes(1);

    await click(5, 2);
    await press("p");
    // The low layer is now on top, but its penetration('p') keeps the key
    // transparent, so it still falls through to the high layer.
    expect(highKey).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("does not raise when the clicked region did not opt in", async () => {
    const { unmount } = renderApp(ClickRiseScreen);
    await flush();

    // Click the high layer's region (columns 24..43) — it has no
    // clickOnRise, so nothing changes.
    await click(33, 2);
    await press("x");
    expect(highKey).toHaveBeenCalledTimes(1);
    expect(lowKey).not.toHaveBeenCalled();

    unmount();
  });
});
