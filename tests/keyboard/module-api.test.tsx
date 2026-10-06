import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import {
  getEngine,
  registerEngine,
  withOwner,
} from "../../src/keyboard/provider/KeyboardProvider.js";
import { KeyboardEngine } from "@cartridge-engine/keyboard-engine";
import {
  abortComposition,
  activeProcessor,
  addAction,
  addCondition,
  addMapping,
  addMode,
  addProcessor,
  addSequenceAction,
  bufferedCompositionCount,
  clearAllCompositionKeys,
  clearCompositionBuffers,
  clearSequenceOperations,
  clearShortcutOperations,
  currentScreenHasSequenceWaiting,
  defineSequenceAction,
  defineShortcutAction,
  enableWildcardPriority,
  getCompositionContext,
  getCurrentMode,
  getGlobalKeys,
  getGlobalPendingSequence,
  getGlobalSequences,
  getHoveredMouseRegion,
  getLastCompositionEvent,
  getLastMappingEvent,
  getProcessors,
  globalKeys,
  globalSequence,
  hasAction,
  hasPendingComposition,
  hasSequenceAction,
  kickProcessor,
  modifyAction,
  modifySequenceAction,
  nextMode,
  prevMode,
  readLayer,
  registerMouseRegion,
  registryCompositionKey,
  removeAction,
  removeCompositionKey,
  removeCondition,
  removeMapping,
  removeMappingKey,
  removeMode,
  removeProcessor,
  removeSequenceAction,
  resetProcessors,
  setCondition,
  setMode,
  setProcessorWeight,
  setValueSchema,
  subscribeComposition,
  subscribeFocus,
  subscribeMapping,
  thereGlobalQueueWaiting,
  undoComposition,
  unregisterMouseRegion,
  updateCompositionKey,
} from "../../src/keyboard/moduleApi.js";

function Main() {
  return <Text>Main</Text>;
}

/** Never rendered — used as a foreign owner to prove withOwner scoping. */
function OtherOwner() {
  return <Text>Other</Text>;
}

/** Calls the module-level API from its own effect, which React runs BEFORE
 *  the provider's effects — so it only works if the engine is registered
 *  during render. */
let childCallError: unknown = null;
function ApiChild() {
  useEffect(() => {
    try {
      addProcessor({ id: "from-child", process: () => false });
    } catch (err) {
      childCallError = err;
    }
  }, []);
  return <Text>ApiChild</Text>;
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

let currentUnmount: (() => void) | null = null;

function renderApp(screen: React.ComponentType = Main) {
  const app = render(
    <ScenarioManagementProvider defaultScreen={screen}>
      <KeyboardProvider modes={["normal", "insert"]} defaultMode="normal">
        <CurrentScreen />
      </KeyboardProvider>
    </ScenarioManagementProvider>,
  );
  currentUnmount = app.unmount;
  return app;
}

describe("module-level keyboard API", () => {
  beforeEach(() => {
    clearRegistry();
    registerComponent(Main, {});
  });

  afterEach(() => {
    currentUnmount?.();
    currentUnmount = null;
    clearDispatchers();
    vi.clearAllMocks();
  });

  it("throws when no provider is mounted", () => {
    expect(() => getEngine()).toThrow(/No KeyboardEngine is mounted/);
  });

  it("keeps a shared engine registered until its last provider unmounts", () => {
    const engine = new KeyboardEngine({
      normalizeKeyNames: (input: string) => (input ? [input] : []),
      isNormalChar: () => false,
    });
    // Two providers sharing one engine — distinct tokens, same engine.
    const unregisterA = registerEngine(engine);
    const unregisterB = registerEngine(engine);
    try {
      unregisterA();
      // B is still mounted, so the shared engine must remain resolvable.
      expect(getEngine()).toBe(engine);
    } finally {
      unregisterB();
    }
    expect(() => getEngine()).toThrow(/No KeyboardEngine is mounted/);
  });

  it("forwards processor calls to the mounted engine", async () => {
    renderApp();
    await flush();

    expect(getProcessors().some((p) => p.id === "probe")).toBe(false);

    addProcessor({ id: "probe", process: () => false }, { weight: 5 });
    expect(getProcessors().some((p) => p.id === "probe")).toBe(true);

    expect(setProcessorWeight("probe", 3)).toBe(true);
    expect(getProcessors().find((p) => p.id === "probe")?.weight).toBe(3);

    expect(removeProcessor("probe")).toBe(true);
    expect(getProcessors().some((p) => p.id === "probe")).toBe(false);
  });

  it("drives modes at module level", async () => {
    renderApp();
    await flush();

    expect(getCurrentMode()).toBe("normal");
    setMode("insert");
    expect(getCurrentMode()).toBe("insert");
  });

  it("manages shortcut actions at module level", async () => {
    renderApp();
    await flush();

    addAction({ actionId: "greet", action: vi.fn(), keys: ["g"] });
    expect(hasAction("greet")).toBe(true);
    removeAction("greet");
    expect(hasAction("greet")).toBe(false);
  });

  it("wires every module-level export to the mounted engine", async () => {
    renderApp();
    await flush();

    const cases: Array<[string, () => void]> = [
      ["globalKeys", () => globalKeys([])],
      ["getGlobalKeys", () => getGlobalKeys()],
      ["globalSequence", () => globalSequence([])],
      ["getGlobalSequences", () => getGlobalSequences()],
      ["getGlobalPendingSequence", () => getGlobalPendingSequence()],
      ["thereGlobalQueueWaiting", () => thereGlobalQueueWaiting()],
      [
        "currentScreenHasSequenceWaiting",
        () => currentScreenHasSequenceWaiting(),
      ],
      ["subscribeFocus", () => subscribeFocus(() => {})()],
      ["defineShortcutAction", () => defineShortcutAction([])],
      [
        "addAction",
        () => addAction({ actionId: "a", action: () => {}, keys: ["z"] }),
      ],
      ["hasAction", () => hasAction("a")],
      ["modifyAction", () => modifyAction("a", ["y"])],
      ["removeAction", () => removeAction("a")],
      ["clearShortcutOperations", () => clearShortcutOperations()],
      ["defineSequenceAction", () => defineSequenceAction([])],
      [
        "addSequenceAction",
        () =>
          addSequenceAction({
            sequenceActionId: "s",
            action: () => {},
            keys: ["g", "g"],
          }),
      ],
      ["hasSequenceAction", () => hasSequenceAction("s")],
      ["modifySequenceAction", () => modifySequenceAction("s", ["g", "h"])],
      ["removeSequenceAction", () => removeSequenceAction("s")],
      ["clearSequenceOperations", () => clearSequenceOperations()],
      ["readLayer", () => readLayer(Main)],
      ["getCurrentMode", () => getCurrentMode()],
      ["addMode", () => addMode("extra")],
      ["removeMode", () => removeMode("extra")],
      ["setMode", () => setMode("normal")],
      ["nextMode", () => nextMode()],
      ["prevMode", () => prevMode()],
      ["addCondition", () => addCondition("c", true)],
      ["setCondition", () => setCondition("c", false)],
      ["removeCondition", () => removeCondition("c")],
      ["addProcessor", () => addProcessor({ id: "tmp", process: () => false })],
      ["removeProcessor", () => removeProcessor("tmp")],
      ["getProcessors", () => getProcessors()],
      ["resetProcessors", () => resetProcessors()],
      ["kickProcessor", () => kickProcessor("modal")],
      ["activeProcessor", () => activeProcessor("modal")],
      ["setProcessorWeight", () => setProcessorWeight("modal", 8000)],
      [
        "registryCompositionKey",
        () =>
          registryCompositionKey({
            key: "z",
            flags: [],
            needs: [],
            alternativeFlag: "z",
          }),
      ],
      ["removeCompositionKey", () => removeCompositionKey("nope")],
      ["clearAllCompositionKeys", () => clearAllCompositionKeys()],
      ["hasPendingComposition", () => hasPendingComposition()],
      ["getCompositionContext", () => getCompositionContext()],
      ["abortComposition", () => abortComposition()],
      ["updateCompositionKey", () => updateCompositionKey("nope", [], {})],
      ["setValueSchema", () => setValueSchema({})],
      ["undoComposition", () => undoComposition()],
      ["bufferedCompositionCount", () => bufferedCompositionCount()],
      ["clearCompositionBuffers", () => clearCompositionBuffers()],
      ["subscribeComposition", () => subscribeComposition(() => {})()],
      ["getLastCompositionEvent", () => getLastCompositionEvent()],
      ["addMapping", () => addMapping(["a"], ["b"])],
      ["removeMappingKey", () => removeMappingKey(["a"])],
      ["removeMapping", () => removeMapping("a")],
      ["subscribeMapping", () => subscribeMapping(() => {})()],
      ["getLastMappingEvent", () => getLastMappingEvent()],
      [
        "registerMouseRegion",
        () =>
          registerMouseRegion({
            layerId: "l",
            regionId: "r",
            rect: { x: 1, y: 1, width: 1, height: 1 },
            callbacks: {},
          }),
      ],
      ["unregisterMouseRegion", () => unregisterMouseRegion("l", "r")],
      ["getHoveredMouseRegion", () => getHoveredMouseRegion()],
      ["enableWildcardPriority", () => enableWildcardPriority()()],
    ];

    for (const [name, run] of cases) {
      let error: unknown = null;
      try {
        run();
      } catch (e) {
        error = e;
      }
      // Every flat export must reach the mounted engine; a "no engine mounted"
      // error would mean it is not wired to `getEngine()`.
      expect(
        `${name}: ${error instanceof Error ? error.message : error}`,
      ).not.toMatch(/No KeyboardEngine is mounted/);
    }
  });

  it("withOwner scopes a manual engine binding to the given owner", async () => {
    const onPage = vi.fn();
    const onGhost = vi.fn();
    const { stdin } = renderApp();
    await flush();

    const offPage = withOwner(Main, () =>
      getEngine().boundKeyboard(["z"], onPage),
    );
    // OtherOwner is not on the screen stack: with the owner pushed, this
    // binding is scoped to its own layer and must never fire; without the
    // push it would fall back to the current page and fire on 'x'.
    const offGhost = withOwner(OtherOwner, () =>
      getEngine().boundKeyboard(["x"], onGhost),
    );

    await pressKey(stdin, "z");
    await pressKey(stdin, "x");
    await flush();

    expect(onPage).toHaveBeenCalledTimes(1);
    expect(onGhost).not.toHaveBeenCalled();

    offPage();
    offGhost();
    await pressKey(stdin, "z");
    await flush();
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it("resolves the engine from a child effect", async () => {
    childCallError = null;
    registerComponent(ApiChild, {});
    renderApp(ApiChild);
    await flush();

    expect(childCallError).toBeNull();
    expect(getProcessors().some((p) => p.id === "from-child")).toBe(true);
  });

  it("throws again once the provider unmounts", async () => {
    const app = renderApp();
    await flush();
    expect(getEngine()).toBeDefined();

    await act(async () => {
      app.unmount();
    });
    currentUnmount = null;

    expect(() => getEngine()).toThrow(/No KeyboardEngine is mounted/);
  });
});
