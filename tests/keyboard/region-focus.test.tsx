import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect, useState, type ComponentType, type RefObject } from "react";
import { Box, Text, render as inkRender, type DOMElement } from "ink";
import {
  registerComponent,
  clearRegistry,
} from "../../src/screen/registry.js";
import {
  clearDispatchers,
  ScenarioManagementProvider,
  openLayer,
  applyElement,
  openModalLayer,
  applyElementToModalLayer,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import {
  KeyboardProvider,
} from "../../src/keyboard/provider.js";
import {
  useKeyboard,
  useFocusState,
  useMouseRegion,
} from "../../src/keyboard/hook.js";
import { useScreenSystem } from "../../src/screen/hook.js";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";

/**
 * Region focus integration tests — clicking a mouse region forwards keyboard
 * focus to the focusId recorded by `boundKeyboard`/`boundSequence`
 * `{ ref, focusId }`, so mouse and keyboard converge on one focus target.
 *
 * Keyboard input flows through Ink's readable-stream pattern (write → queue →
 * emit 'readable' → read()); mouse input flows through the xterm-mouse fork's
 * 'data' listener on the same mock stream. SGR sequences: press
 * `\x1b[<0;x;yM` + release `\x1b[<0;x;ym` synthesize a click; `\x1b[<35;x;yM`
 * is a move (motion + button none).
 *
 * Layout: every panel row is absolutely positioned at the screen's top-left,
 * so panel N of width 20 + gap 3 starts at 1-based column 1 + N * 23.
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

beforeEach(() => {
  clearRegistry();
  clearDispatchers();
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

async function move(x: number, y: number): Promise<void> {
  await act(async () => {
    stdin.write(`\x1b[<35;${x};${y}M`);
  });
  await flush();
}

/* ------------------------------------------------------------------ */
/* App 1: boundKeyboard region focus                                   */
/* ------------------------------------------------------------------ */

interface KeyPanelProps {
  label: string;
  focusId: string;
  keyName: string;
  group?: string;
  clickOnFocus?: boolean;
  /** Records focusCurrent() inside the user onClick — proves ordering. */
  recordOrderFocus?: boolean;
}

function KeyPanel({
  label,
  focusId,
  keyName,
  group,
  clickOnFocus,
  recordOrderFocus,
}: KeyPanelProps) {
  const { boundKeyboard, focusCurrent } = useKeyboard();
  const focused = useFocusState(focusId, group);
  const [clicks, setClicks] = useState(0);
  const [keys, setKeys] = useState(0);
  const [orderFocused, setOrderFocused] = useState("-");

  const ref = useMouseRegion(
    {
      onClick: () => {
        setClicks((c) => c + 1);
        if (recordOrderFocus) {
          setOrderFocused(focusCurrent(group).result?.id ?? "none");
        }
      },
    },
    clickOnFocus === false ? { clickOnFocus: false } : undefined,
  );

  useEffect(() => {
    return boundKeyboard([keyName], () => setKeys((k) => k + 1), {
      ref,
      focusId: group ? { group, focusId } : focusId,
    });
  }, [boundKeyboard, keyName, ref, focusId, group]);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} k{keys} c{clicks}
        {recordOrderFocus ? ` of:${orderFocused}` : ""}
      </Text>
    </Box>
  );
}

/**
 * Row of four panels: A/B default-group (B records focus order, togglable
 * via 't'), C with clickOnFocus:false, D in the named group 'gd' (kicked on
 * mount so only a CLICK can activate it).
 */
function KeyFocusScreen() {
  const { boundKeyboard, kickFocusGroup } = useKeyboard();
  const [showB, setShowB] = useState(true);

  useEffect(() => {
    const toggle = boundKeyboard(["t"], () => setShowB((v) => !v));
    // Child effects have run by now, so the group exists — kick it so the
    // named-group panel proves click forwarding, not auto-activation.
    kickFocusGroup("gd");
    return toggle;
  }, [boundKeyboard, kickFocusGroup]);

  return (
    <Box flexDirection="column" width="100%">
      <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
        <KeyPanel label="A" focusId="btn-a" keyName="a" />
        {showB ? (
          <KeyPanel label="B" focusId="btn-b" keyName="b" recordOrderFocus />
        ) : null}
        <KeyPanel label="C" focusId="btn-c" keyName="c" clickOnFocus={false} />
        <KeyPanel label="D" focusId="btn-d" keyName="d" group="gd" />
      </Box>
    </Box>
  );
}

describe("region focus with boundKeyboard", () => {
  it("click forwards focus to the clicked panel and scoped keys follow", async () => {
    const { unmount } = renderApp(KeyFocusScreen);
    await flush();

    // The first registered default-group target is auto-focused; the named
    // group was kicked on mount.
    expect(lastFrameText()).toContain("A f1 k0 c0");
    expect(lastFrameText()).toContain("D f0");

    await press("a");
    expect(lastFrameText()).toContain("A f1 k1 c0");

    // B spans columns 24..43 — click its center (33,2).
    await click(33, 2);
    expect(lastFrameText()).toContain("B f1 k0 c1");
    expect(lastFrameText()).toContain("A f0 k1 c0");

    await press("a");
    expect(lastFrameText()).toContain("A f0 k1 c0");
    await press("b");
    expect(lastFrameText()).toContain("B f1 k1 c1");

    unmount();
  });

  it("forwards focus BEFORE the user's onClick runs", async () => {
    const { unmount } = renderApp(KeyFocusScreen);
    await flush();

    await click(33, 2);
    // The user onClick records focusCurrent() at click time: it must already
    // see btn-b, proving the forwarding ran first.
    expect(lastFrameText()).toContain("B f1 k0 c1 of:btn-b");

    unmount();
  });

  it("clickOnFocus:false keeps clicks purely on mouse callbacks", async () => {
    const { unmount } = renderApp(KeyFocusScreen);
    await flush();

    // C spans columns 47..66 — click it, but focus must stay on A.
    await click(56, 2);
    expect(lastFrameText()).toContain("C f0 k0 c1");
    expect(lastFrameText()).toContain("A f1 k0 c0");

    await press("a");
    expect(lastFrameText()).toContain("A f1 k1 c0");

    unmount();
  });

  it("click activates a named focus group via a FocusRef entry", async () => {
    const { unmount } = renderApp(KeyFocusScreen);
    await flush();
    expect(lastFrameText()).toContain("D f0");

    // D spans columns 70..89 — click it; the group entry activates.
    await click(79, 2);
    expect(lastFrameText()).toContain("D f1 k0 c1");

    await press("d");
    expect(lastFrameText()).toContain("D f1 k1 c1");

    unmount();
  });

  it("unmount releases the region-focus link; remount re-registers it", async () => {
    const { unmount } = renderApp(KeyFocusScreen);
    await flush();

    await click(33, 2);
    expect(lastFrameText()).toContain("B f1 k0 c1 of:btn-b");

    // 't' hides B — its binding AND region-focus entry are released. The
    // row shrinks, so columns 24..43 now hold C.
    await press("t");
    expect(lastFrameText()).not.toContain("of:btn-b");

    // Clicking genuinely empty coordinates (nothing past column 66 now)
    // must not crash or focus anything.
    await click(80, 2);
    expect(lastFrameText()).not.toContain("of:btn-b");

    // Remount: B is a fresh instance — counters reset to zero and the
    // region-focus link is registered anew.
    await press("t");
    await flush();
    expect(lastFrameText()).toContain("B f1 k0 c0 of:-");

    // The first click on the fresh instance hits and forwards again.
    await click(33, 2);
    expect(lastFrameText()).toContain("B f1 k0 c1 of:btn-b");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 2: boundSequence region focus — all three calling conventions   */
/* ------------------------------------------------------------------ */

interface SeqViewProps {
  label: string;
  ref: RefObject<DOMElement | null>;
  focused: boolean;
  shots: number;
  clicks: number;
  hovered: boolean;
}

function SeqView({ label, ref, focused, shots, clicks, hovered }: SeqViewProps) {
  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} q{shots} c{clicks} h{hovered ? "1" : "0"}
      </Text>
    </Box>
  );
}

/** Form 2: boundSequence(keys, actionId, { ref, focusId }) — no preset keys. */
function Form2Panel({ label, focusId }: { label: string; focusId: string }) {
  const { boundSequence, defineSequenceAction } = useKeyboard();
  const focused = useFocusState(focusId);
  const [shots, setShots] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [hovered, setHovered] = useState(false);

  const ref = useMouseRegion({
    onClick: () => setClicks((c) => c + 1),
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  useEffect(() => {
    defineSequenceAction([
      { sequenceActionId: `${focusId}-fire`, action: () => setShots((n) => n + 1) },
    ]);
    return boundSequence(["x", "x"], `${focusId}-fire`, { ref, focusId });
  }, [boundSequence, defineSequenceAction, ref, focusId]);

  return (
    <SeqView
      label={label}
      ref={ref}
      focused={focused}
      shots={shots}
      clicks={clicks}
      hovered={hovered}
    />
  );
}

/** Form 3: boundSequence(actionId, { ref, focusId }) — preset keys g g. */
function Form3Panel({ label, focusId }: { label: string; focusId: string }) {
  const { boundSequence, defineSequenceAction } = useKeyboard();
  const focused = useFocusState(focusId);
  const [shots, setShots] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [hovered, setHovered] = useState(false);

  const ref = useMouseRegion({
    onClick: () => setClicks((c) => c + 1),
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  useEffect(() => {
    defineSequenceAction([
      {
        sequenceActionId: `${focusId}-fire`,
        action: () => setShots((n) => n + 1),
        keys: ["g", "g"],
      },
    ]);
    return boundSequence(`${focusId}-fire`, { ref, focusId });
  }, [boundSequence, defineSequenceAction, ref, focusId]);

  return (
    <SeqView
      label={label}
      ref={ref}
      focused={focused}
      shots={shots}
      clicks={clicks}
      hovered={hovered}
    />
  );
}

/** Form 1: boundSequence(keys, handler, { ref, focusId }) — explicit callback. */
function Form1Panel({ label, focusId }: { label: string; focusId: string }) {
  const { boundSequence } = useKeyboard();
  const focused = useFocusState(focusId);
  const [shots, setShots] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [hovered, setHovered] = useState(false);

  const ref = useMouseRegion({
    onClick: () => setClicks((c) => c + 1),
    onEnter: () => setHovered(true),
    onLeave: () => setHovered(false),
  });

  useEffect(() => {
    return boundSequence(["c", "c"], () => setShots((n) => n + 1), {
      ref,
      focusId,
    });
  }, [boundSequence, ref, focusId]);

  return (
    <SeqView
      label={label}
      ref={ref}
      focused={focused}
      shots={shots}
      clicks={clicks}
      hovered={hovered}
    />
  );
}

/** S1/S2 share the x x keys, G uses preset g g, C uses explicit c c. */
function SequenceFocusScreen() {
  return (
    <Box flexDirection="column" width="100%">
      <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
        <Form2Panel label="S1" focusId="btn-s1" />
        <Form2Panel label="S2" focusId="btn-s2" />
        <Form3Panel label="G" focusId="btn-g" />
        <Form1Panel label="C" focusId="btn-c" />
      </Box>
    </Box>
  );
}

describe("region focus with boundSequence", () => {
  it("boundSequence(keys, actionId) fires only for the clicked panel", async () => {
    const { unmount } = renderApp(SequenceFocusScreen);
    await flush();

    // S1 auto-focused — its x x sequence fires first.
    await press("x");
    await press("x");
    expect(lastFrameText()).toContain("S1 f1 q1 c0 h0");

    // S2 spans columns 24..43 — click it, focus moves, x x now fires S2.
    await click(33, 2);
    expect(lastFrameText()).toContain("S2 f1 q0 c1 h0");
    await press("x");
    await press("x");
    expect(lastFrameText()).toContain("S2 f1 q1 c1 h0");
    expect(lastFrameText()).toContain("S1 f0 q1 c0 h0");

    unmount();
  });

  it("boundSequence(actionId) preset-keys form forwards focus on click", async () => {
    const { unmount } = renderApp(SequenceFocusScreen);
    await flush();

    // G spans columns 47..66.
    await click(56, 2);
    expect(lastFrameText()).toContain("G f1 q0 c1 h0");
    await press("g");
    await press("g");
    expect(lastFrameText()).toContain("G f1 q1 c1 h0");

    unmount();
  });

  it("boundSequence(keys, handler) explicit form forwards focus on click", async () => {
    const { unmount } = renderApp(SequenceFocusScreen);
    await flush();

    // C spans columns 70..89.
    await click(79, 2);
    expect(lastFrameText()).toContain("C f1 q0 c1 h0");
    await press("c");
    await press("c");
    expect(lastFrameText()).toContain("C f1 q1 c1 h0");

    unmount();
  });

  it("hover does not forward focus — only click participates", async () => {
    const { unmount } = renderApp(SequenceFocusScreen);
    await flush();

    // Move the cursor over S2: hover state flips, focus stays on S1.
    await move(33, 2);
    expect(lastFrameText()).toContain("S2 f0 q0 c0 h1");
    expect(lastFrameText()).toContain("S1 f1 q0 c0 h0");

    await press("x");
    await press("x");
    expect(lastFrameText()).toContain("S1 f1 q1 c0 h0");
    expect(lastFrameText()).toContain("S2 f0 q0 c0 h1");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 3: region focus inside a layer element                          */
/* ------------------------------------------------------------------ */

function ZPanel({ label, focusId }: { label: string; focusId: string }) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [keys, setKeys] = useState(0);
  const [clicks, setClicks] = useState(0);

  const ref = useMouseRegion({ onClick: () => setClicks((c) => c + 1) });

  useEffect(() => {
    return boundKeyboard(["z"], () => setKeys((k) => k + 1), { ref, focusId });
  }, [boundKeyboard, ref, focusId]);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} k{keys} c{clicks}
      </Text>
    </Box>
  );
}

/** Both panels bind 'z' focus-scoped — only the focused one fires. */
function LayerContent() {
  return (
    <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
      <ZPanel label="Z1" focusId="btn-z1" />
      <ZPanel label="Z2" focusId="btn-z2" />
    </Box>
  );
}

function LayerFocusScreen() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(["o"], () => {
      openLayer("l1", 1);
      applyElement("l1", { elementId: "le1", element: LayerContent, props: {} });
    });
  }, [boundKeyboard]);

  return (
    <Box flexDirection="column" width="100%">
      <Text>press o to open the layer</Text>
    </Box>
  );
}

describe("region focus inside layers", () => {
  it("resolves the layer's regionFocus map and forwards within the element", async () => {
    const { unmount } = renderApp(LayerFocusScreen);
    await flush();

    await press("o");
    await flush();
    await flush();

    // The layer element's first focus target is auto-focused.
    expect(lastFrameText()).toContain("Z1 f1 k0 c0");
    await press("z");
    expect(lastFrameText()).toContain("Z1 f1 k1 c0");

    // Z2 spans columns 24..43 inside the layer element — click it: the
    // forwarding resolves the LAYER's map, not the page's.
    await click(33, 2);
    expect(lastFrameText()).toContain("Z2 f1 k0 c1");
    expect(lastFrameText()).toContain("Z1 f0 k1 c0");

    await press("z");
    expect(lastFrameText()).toContain("Z2 f1 k1 c1");
    expect(lastFrameText()).toContain("Z1 f0 k1 c0");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 4: region focus inside a modal layer element                    */
/* ------------------------------------------------------------------ */

function MPanel({ label, focusId }: { label: string; focusId: string }) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [keys, setKeys] = useState(0);
  const [clicks, setClicks] = useState(0);

  const ref = useMouseRegion({ onClick: () => setClicks((c) => c + 1) });

  useEffect(() => {
    return boundKeyboard(["m"], () => setKeys((k) => k + 1), { ref, focusId });
  }, [boundKeyboard, ref, focusId]);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} k{keys} c{clicks}
      </Text>
    </Box>
  );
}

/** Both modal panels bind 'm' focus-scoped — only the focused one fires. */
function ModalContent() {
  return (
    <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
      <MPanel label="M1" focusId="btn-m1" />
      <MPanel label="M2" focusId="btn-m2" />
    </Box>
  );
}

function ModalFocusScreen() {
  const { boundKeyboard } = useKeyboard();
  useEffect(() => {
    return boundKeyboard(["o"], () => {
      openModalLayer("m1", 10);
      applyElementToModalLayer("m1", {
        elementId: "me1",
        element: ModalContent,
        props: {},
      });
    });
  }, [boundKeyboard]);

  return (
    <Box flexDirection="column" width="100%">
      <Text>press o to open the modal</Text>
    </Box>
  );
}

describe("region focus inside modal layers", () => {
  it("resolves the modal layer's regionFocus map and forwards within the element", async () => {
    const { unmount } = renderApp(ModalFocusScreen);
    await flush();

    await press("o");
    await flush();
    await flush();

    // The modal element's first focus target is auto-focused.
    expect(lastFrameText()).toContain("M1 f1 k0 c0");
    await press("m");
    expect(lastFrameText()).toContain("M1 f1 k1 c0");

    // M2 spans columns 24..43 — click it: the forwarding resolves the
    // MODAL layer's map, not the page's.
    await click(33, 2);
    expect(lastFrameText()).toContain("M2 f1 k0 c1");
    expect(lastFrameText()).toContain("M1 f0 k1 c0");

    await press("m");
    expect(lastFrameText()).toContain("M2 f1 k1 c1");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 5: plain mouse region without a keyboard link                   */
/* ------------------------------------------------------------------ */

function PlainPanel() {
  const [clicks, setClicks] = useState(0);
  const ref = useMouseRegion({ onClick: () => setClicks((c) => c + 1) });
  return (
    <Box ref={ref} width={20} height={3}>
      <Text>P c{clicks}</Text>
    </Box>
  );
}

function MouseOnlyScreen() {
  return (
    <Box flexDirection="column" width="100%">
      <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
        <PlainPanel />
        <KeyPanel label="A" focusId="btn-a" keyName="a" />
      </Box>
    </Box>
  );
}

describe("region focus with unlinked mouse regions", () => {
  it("clicking a region with no recorded entry is a no-op for focus", async () => {
    const { unmount } = renderApp(MouseOnlyScreen);
    await flush();
    expect(lastFrameText()).toContain("A f1 k0 c0");

    // P spans columns 1..20 — its click fires but must not move focus.
    await click(10, 2);
    expect(lastFrameText()).toContain("P c1");
    expect(lastFrameText()).toContain("A f1 k0 c0");

    await press("a");
    expect(lastFrameText()).toContain("A f1 k1 c0");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 6: a ref shared by several bindings (reference counting)        */
/* ------------------------------------------------------------------ */

function SharedRefScreen() {
  const { boundKeyboard, kickFocusGroup } = useKeyboard();
  const [clicks, setClicks] = useState(0);
  const [bindU, setBindU] = useState(true);
  const [bindV, setBindV] = useState(true);
  const focused = useFocusState("btn-p");

  const ref = useMouseRegion({ onClick: () => setClicks((c) => c + 1) });

  // Two independent bindings share one ref + focusId; each release
  // decrements the entry's reference count.
  useEffect(() => {
    if (!bindU) return;
    return boundKeyboard(["u"], () => {}, { ref, focusId: "btn-p" });
  }, [boundKeyboard, bindU, ref]);

  useEffect(() => {
    if (!bindV) return;
    return boundKeyboard(["v"], () => {}, { ref, focusId: "btn-p" });
  }, [boundKeyboard, bindV, ref]);

  useEffect(() => {
    const kick = boundKeyboard(["k"], () => kickFocusGroup());
    const offV = boundKeyboard(["t"], () => setBindV((v) => !v));
    const offU = boundKeyboard(["y"], () => setBindU((v) => !v));
    // Runs after the two binding effects above — kick the default group so
    // only a CLICK can activate it.
    kickFocusGroup();
    return () => {
      kick();
      offV();
      offU();
    };
  }, [boundKeyboard, kickFocusGroup]);

  return (
    <Box flexDirection="column" width="100%">
      <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
        <Box ref={ref} width={20} height={3}>
          <Text>P f{focused ? "1" : "0"} c{clicks}</Text>
        </Box>
      </Box>
    </Box>
  );
}

describe("region focus reference counting across shared refs", () => {
  it("keeps the entry while any binding holds the ref; drops it on the last release", async () => {
    const { unmount } = renderApp(SharedRefScreen);
    await flush();
    expect(lastFrameText()).toContain("P f0 c0");

    // Both bindings registered the same ref — click forwards focus.
    await click(10, 2);
    expect(lastFrameText()).toContain("P f1 c1");

    // Kick focus away, then release ONE binding: the entry survives the
    // remaining binding, so the click still forwards.
    await press("k");
    expect(lastFrameText()).toContain("P f0 c1");
    await press("t"); // unbind v — count 2 -> 1
    await click(10, 2);
    expect(lastFrameText()).toContain("P f1 c2");

    // Release the LAST binding: the entry is deleted, clicks stop
    // forwarding, but the user onClick still runs.
    await press("k");
    expect(lastFrameText()).toContain("P f0 c2");
    await press("y"); // unbind u — count 1 -> 0
    await click(10, 2);
    expect(lastFrameText()).toContain("P f0 c3");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 7: hover-driven focus — enterOnFocus / leaveOffFocus            */
/* ------------------------------------------------------------------ */

interface HoverPanelProps {
  label: string;
  focusId: string;
  keyName: string;
  enterOnFocus?: boolean;
  leaveOffFocus?: boolean;
  clickOnFocus?: boolean;
  group?: string;
  /** Records focusCurrent() inside the user onEnter — proves ordering. */
  recordOrderFocus?: boolean;
}

function HoverFocusPanel({
  label,
  focusId,
  keyName,
  enterOnFocus,
  leaveOffFocus,
  clickOnFocus,
  group,
  recordOrderFocus,
}: HoverPanelProps) {
  const { boundKeyboard, focusCurrent } = useKeyboard();
  const focused = useFocusState(focusId, group);
  const [keys, setKeys] = useState(0);
  const [enters, setEnters] = useState(0);
  const [leaves, setLeaves] = useState(0);
  const [orderFocused, setOrderFocused] = useState("-");

  const ref = useMouseRegion(
    {
      onEnter: () => {
        setEnters((e) => e + 1);
        if (recordOrderFocus) {
          setOrderFocused(focusCurrent(group).result?.id ?? "none");
        }
      },
      onLeave: () => setLeaves((l) => l + 1),
    },
    { enterOnFocus, leaveOffFocus, clickOnFocus },
  );

  useEffect(() => {
    return boundKeyboard([keyName], () => setKeys((k) => k + 1), {
      ref,
      focusId: group ? { group, focusId } : focusId,
    });
  }, [boundKeyboard, keyName, ref, focusId, group]);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} k{keys} e{enters} l{leaves}
        {recordOrderFocus ? ` of:${orderFocused}` : ""}
      </Text>
    </Box>
  );
}

/**
 * H1 hover-focus (leave clears by default); H2 hover-focus with
 * leaveOffFocus:false; H3 click-only; H4 hover-focus in named group g4
 * (kicked on mount so only a hover can activate it).
 */
function HoverFocusScreen() {
  const { kickFocusGroup } = useKeyboard();
  useEffect(() => {
    kickFocusGroup("g4");
  }, [kickFocusGroup]);

  return (
    <Box flexDirection="column" width="100%">
      <Box position="absolute" top={0} left={0} flexDirection="row" gap={3}>
        <HoverFocusPanel label="H1" focusId="btn-h1" keyName="h" enterOnFocus />
        <HoverFocusPanel
          label="H2"
          focusId="btn-h2"
          keyName="h"
          enterOnFocus
          leaveOffFocus={false}
        />
        <HoverFocusPanel label="H3" focusId="btn-h3" keyName="h" clickOnFocus />
        <HoverFocusPanel
          label="H4"
          focusId="btn-h4"
          keyName="j"
          enterOnFocus
          group="g4"
          recordOrderFocus
        />
      </Box>
    </Box>
  );
}

describe("region focus hover forwarding (enterOnFocus / leaveOffFocus)", () => {
  it("hover forwards focus; leaving clears it by default", async () => {
    const { unmount } = renderApp(HoverFocusScreen);
    await flush();

    // H1 is the first registered default-group target — auto-focused.
    expect(lastFrameText()).toContain("H1 f1 k0 e0 l0");
    expect(lastFrameText()).toContain("H4 f0");

    // Move onto H2: H2's enter focuses. H1 shows no leave count — its
    // initial focus was auto-activated, not mouse-earned, so no hover state
    // existed to leave; H1's f0 comes from H2's focusSet replacing it.
    await move(33, 2);
    expect(lastFrameText()).toContain("H2 f1 k0 e1 l0");
    expect(lastFrameText()).toContain("H1 f0 k0 e0 l0");

    await press("h");
    expect(lastFrameText()).toContain("H2 f1 k1 e1 l0");

    // A repeated move on the same region does not re-fire enter (the hover
    // state machine fires boundary crossings exactly once).
    await move(33, 2);
    expect(lastFrameText()).toContain("H2 f1 k1 e1 l0");

    // Move back onto H1: its enter re-focuses it, replacing H2. H2's own
    // leave does NOT clear (leaveOffFocus:false) — H2's f0 is replacement,
    // not a kick.
    await move(10, 2);
    expect(lastFrameText()).toContain("H1 f1 k0 e1 l0");
    expect(lastFrameText()).toContain("H2 f0 k1 e1 l1");

    // Move into the gap: nothing is hovered, H1's leave clears the focus —
    // the default leaveOffFocus:true behavior.
    await move(44, 2);
    expect(lastFrameText()).toContain("H1 f0 k0 e1 l1");
    expect(lastFrameText()).toContain("H2 f0 k1 e1 l1");

    // With no focus anywhere, the focus-scoped 'h' key is silent.
    await press("h");
    expect(lastFrameText()).toContain("H1 f0 k0 e1 l1");
    expect(lastFrameText()).toContain("H2 f0 k1 e1 l1");

    unmount();
  });

  it("leaveOffFocus:false keeps the focus when the cursor leaves", async () => {
    const { unmount } = renderApp(HoverFocusScreen);
    await flush();

    // Move onto H2, then off it into the gap: H2 keeps focus.
    await move(33, 2);
    expect(lastFrameText()).toContain("H2 f1");
    await move(44, 2);
    expect(lastFrameText()).toContain("H2 f1 k0 e1 l1");

    await press("h");
    expect(lastFrameText()).toContain("H2 f1 k1 e1 l1");

    unmount();
  });

  it("a click-only region never loses focus by the cursor leaving it", async () => {
    const { unmount } = renderApp(HoverFocusScreen);
    await flush();

    // Hovering H3 does nothing (enterOnFocus is off); focus stays on H1.
    await move(56, 2);
    expect(lastFrameText()).toContain("H3 f0 k0 e1 l0");
    expect(lastFrameText()).toContain("H1 f1 k0 e0 l0");

    // A click focuses H3.
    await click(56, 2);
    expect(lastFrameText()).toContain("H3 f1 k0 e1 l0");
    expect(lastFrameText()).toContain("H1 f0");

    // Leaving H3 must NOT clear the click-earned focus.
    await move(44, 2);
    expect(lastFrameText()).toContain("H3 f1 k0 e1 l1");

    await press("h");
    expect(lastFrameText()).toContain("H3 f1 k1 e1 l1");

    unmount();
  });

  it("hover activates a named group via a FocusRef entry and leave kicks it", async () => {
    const { unmount } = renderApp(HoverFocusScreen);
    await flush();
    expect(lastFrameText()).toContain("H4 f0");

    // Hover onto H4: the FocusRef entry activates group g4, and the
    // forwarding ran BEFORE the user's onEnter (recorded focus is btn-h4).
    await move(79, 2);
    expect(lastFrameText()).toContain("H4 f1 k0 e1 l0 of:btn-h4");

    // 'j' is H4's own key (the default group still holds H1 in parallel,
    // so a shared key would hit H1 first) — pressing it fires H4 only.
    await press("j");
    expect(lastFrameText()).toContain("H4 f1 k1 e1 l0");
    expect(lastFrameText()).toContain("H1 f1 k0 e0 l0");

    // Leaving H4 kicks its named group; H1's default-group focus stays.
    await move(67, 2);
    expect(lastFrameText()).toContain("H4 f0 k1 e1 l1");
    expect(lastFrameText()).toContain("H1 f1 k0 e0 l0");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 4: two sibling layers — clicking the LOWER layer's region       */
/*                                                                     */
/* The owner stack top is the LAST mounted layer element (the high     */
/* one). Forwarding focus from the low region must re-push the low     */
/* layer's owner, or focusSet resolves against the high layer and      */
/* silently no-ops.                                                    */
/* ------------------------------------------------------------------ */

interface LowerLayerPanelProps {
  label: string;
  left: number;
  focusId: string;
  keyName: string;
  /** Registered first, so `focusId` starts inactive until a click focuses it. */
  seedFocusId?: string;
}

function LowerLayerPanel({
  label,
  left,
  focusId,
  keyName,
  seedFocusId,
}: LowerLayerPanelProps) {
  const { boundKeyboard } = useKeyboard();
  const focused = useFocusState(focusId);
  const [clicks, setClicks] = useState(0);
  const [keys, setKeys] = useState(0);
  const ref = useMouseRegion({ onClick: () => setClicks((c) => c + 1) });

  useEffect(() => {
    const unbinds: (() => void)[] = [];
    if (seedFocusId) {
      unbinds.push(boundKeyboard(["z"], () => {}, { focusId: seedFocusId }));
    }
    unbinds.push(
      boundKeyboard([keyName], () => setKeys((k) => k + 1), { ref, focusId }),
    );
    return () => unbinds.forEach((unbind) => unbind());
  }, [boundKeyboard, ref, focusId, keyName, seedFocusId]);

  return (
    <Box ref={ref} position="absolute" top={0} left={left} width={20} height={3}>
      <Text>
        {label} f{focused ? "1" : "0"} k{keys} c{clicks}
      </Text>
    </Box>
  );
}

const LowLayerPanel = () => (
  <LowerLayerPanel
    label="Low"
    left={0}
    focusId="lf"
    keyName="l"
    seedFocusId="lo-seed"
  />
);
const HighLayerPanel = () => (
  <LowerLayerPanel label="High" left={23} focusId="hf" keyName="h" />
);

function TwoLayerFocusScreen() {
  const { openLayer, applyElement } = useScreenSystem();
  useEffect(() => {
    openLayer("low", 1);
    applyElement("low", { elementId: "low-el", element: LowLayerPanel });
    openLayer("high", 2);
    applyElement("high", { elementId: "high-el", element: HighLayerPanel });
  }, [openLayer, applyElement]);
  return <Text>page</Text>;
}

describe("region focus across sibling layers", () => {
  it("clicking the lower layer's region focuses its own target", async () => {
    const { unmount } = renderApp(TwoLayerFocusScreen);
    await flush();

    // High is mounted last, so it tops the owner stack. Low's seed target
    // holds low's focus, so "lf" starts inactive.
    expect(lastFrameText()).toContain("Low f0");
    expect(lastFrameText()).toContain("High f1");

    // Columns 1..20 hold the low region; the high one starts at 23.
    await click(5, 2);
    expect(lastFrameText()).toContain("Low f1 k0 c1");

    // The focus-scoped binding follows the click.
    await press("l");
    expect(lastFrameText()).toContain("Low f1 k1 c1");

    unmount();
  });
});

/* ------------------------------------------------------------------ */
/* App 7: one ref shared by two DIFFERENT focusIds                     */
/*                                                                     */
/* The map must always point at the most recently registered LIVE      */
/* entry: unmounting the latest registration falls back to the one     */
/* still mounted, instead of forwarding to a dead focusId.             */
/* ------------------------------------------------------------------ */

function TwoFocusPanel({ showSecond }: { showSecond: boolean }) {
  const { boundKeyboard } = useKeyboard();
  const first = useFocusState("sf-a");
  const second = useFocusState("sf-b");
  const ref = useMouseRegion({});

  useEffect(() => {
    return boundKeyboard(["a"], () => {}, { ref, focusId: "sf-a" });
  }, [boundKeyboard, ref]);
  useEffect(() => {
    if (!showSecond) return;
    return boundKeyboard(["b"], () => {}, { ref, focusId: "sf-b" });
  }, [boundKeyboard, ref, showSecond]);

  return (
    <Box ref={ref} width={20} height={3}>
      <Text>
        sa:{first ? "1" : "0"} sb:{second ? "1" : "0"}
      </Text>
    </Box>
  );
}

function TwoFocusScreen() {
  const { boundKeyboard } = useKeyboard();
  const [showSecond, setShowSecond] = useState(true);
  useEffect(
    () => boundKeyboard(["t"], () => setShowSecond((v) => !v)),
    [boundKeyboard],
  );
  return <TwoFocusPanel showSecond={showSecond} />;
}

describe("region focus with a ref shared by two focusIds", () => {
  it("falls back to the live entry when the latest registration unmounts", async () => {
    const { unmount } = renderApp(TwoFocusScreen);
    await flush();

    // The latest registration ("sf-b") wins the click.
    await click(5, 2);
    expect(lastFrameText()).toContain("sa:0 sb:1");

    // Unmount the second binding, then click again: the region must forward
    // to the entry whose binding is still mounted.
    await press("t");
    await click(5, 2);
    expect(lastFrameText()).toContain("sa:1 sb:0");

    unmount();
  });
});
