import { describe, expect, it, vi } from "vitest";
import {
  createEngine,
  makeElementKeyboard,
  makeLayerKeyboard,
  makeSyncLayer,
} from "../../_helpers/factories.js";
import KeyboardEngine from "../../../src/KeyboardEngine.js";

const Page = {};

function layerPendingOwner(
  engine: ReturnType<typeof createEngine>,
  layerId: string,
): string | null {
  const layer = engine["layers"].readLayer(layerId);
  if (!layer || !("elementKeyboards" in layer)) return null;
  return (
    layer.pendingSequence as unknown as { fromElementId: string | null }
  ).fromElementId;
}

describe("EngineState", () => {
  it("registers modes, conditions and switches mode", () => {
    const engine = createEngine({ modes: ["normal", "insert"], defaultMode: "normal" });
    expect(engine.getCurrentMode()).toBe("normal");
    expect(engine.addMode("extra")).toBe(true);
    expect(engine.addMode("normal")).toBe(false);
    expect(engine.setMode("insert")).toBe(true);
    expect(engine.setMode("missing")).toBe(false);
    engine.nextMode();
    expect(engine.getCurrentMode()).toBe("extra");
    engine.prevMode();
    expect(engine.getCurrentMode()).toBe("insert");
    expect(engine.removeMode("extra")).toBe(true);
    expect(engine.setMode(null)).toBe(true);
    expect(engine.getCurrentMode()).toBeNull();
  });

  it("adds, updates and removes named conditions", () => {
    const engine = createEngine();
    expect(engine.addCondition("editing", false)).toBe(true);
    expect(engine.addCondition("editing", true)).toBe(false);
    expect(engine.setCondition("editing", true)).toBe(true);
    expect(engine.setCondition("missing", true)).toBe(false);
    expect(engine.removeCondition("editing")).toBe(true);
  });
});

describe("BindingService boundKeyboard", () => {
  it("binds a key on a page and fires through processKey", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    const unbind = engine.boundKeyboard(["a"], handler);
    expect(engine.processKey("a", {})).toBe(false);
    expect(handler).toHaveBeenCalledWith("a", {});
    unbind();
    expect(engine.processKey("a", {})).toBe(false);
  });

  it("supports action ids and preset keys", () => {
    const engine = createEngine();
    const action = vi.fn();
    engine.defineShortcutAction([{ actionId: "save", action, keys: ["s"] }]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard("save", {});
    expect(engine.processKey("s", {})).toBe(false);
    expect(action).toHaveBeenCalled();
    expect(() => engine.boundKeyboard("missing", {})).toThrow();
  });

  it("honours times, observer and once", () => {
    const engine = createEngine();
    const handler = vi.fn();
    const observer = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], handler, { times: 2, observer });
    engine.processKey("a", {});
    expect(handler).not.toHaveBeenCalled();
    expect(observer).toHaveBeenCalledWith(1);
    engine.processKey("a", {});
    expect(handler).toHaveBeenCalledTimes(1);
    engine.processKey("a", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("validates times and observer", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundKeyboard(["a"], () => {}, { times: 0 })).toThrow();
    expect(() =>
      engine.boundKeyboard(["a"], () => {}, { observer: () => {} }),
    ).toThrow();
  });

  it("scopes bindings to a layer element via owner stack", () => {
    const engine = createEngine();
    const layerA = makeLayerKeyboard("A", {
      a1: makeElementKeyboard("a1", "A"),
    });
    const layerB = makeLayerKeyboard("B", {
      b1: makeElementKeyboard("b1", "B"),
    });
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("B", ["b1"]), makeSyncLayer("A", ["a1"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    const aHandler = vi.fn();
    engine.boundKeyboard(["y"], aHandler, { elementId: "a1" });
    engine.popOwner("A");
    engine.pushOwner("B");
    const bHandler = vi.fn();
    engine.boundKeyboard(["x"], bHandler, { elementId: "b1" });
    engine.popOwner("B");

    expect(engine.processKey("x", {})).toBe(true);
    expect(aHandler).not.toHaveBeenCalled();
    expect(bHandler).toHaveBeenCalled();
  });
});

describe("BindingService penetration/stop/allowModal/sequence", () => {
  it("penetration makes a page key transparent", () => {
    const engine = createEngine();
    const pageHandler = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard(["x"], pageHandler);
    engine.penetration(["x"]);
    expect(engine.processKey("x", {})).toBe(false);
    expect(pageHandler).not.toHaveBeenCalled();
  });

  it("stop consumes a key after bindings miss", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.stop(["x"]);
    expect(engine.processKey("x", {})).toBe(false);
  });

  it("stop supports stopAction resolution", () => {
    const engine = createEngine();
    const action = vi.fn();
    engine.defineShortcutAction([{ actionId: "quit", action, keys: ["q"] }]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard("quit", {});
    expect(() => engine.stop(["quit"], { stopAction: true })).not.toThrow();
    expect(engine.processKey("q", {})).toBe(false);
    expect(action).toHaveBeenCalled();
    expect(() => engine.stop(["missing"], { stopAction: true })).toThrow();
  });

  it("allowModal only works inside a modal element", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.allowModal(["x"])).toThrow();

    engine.sync({
      pagePath: [Page],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    expect(() => engine.allowModal(["x"], { elementId: "m1" })).not.toThrow();
    engine.popOwner("M");
  });

  it("boundSequence starts pending and completes on next key", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundSequence(["a", "b"], handler);
    expect(engine.processKey("a", {})).toBe(false);
    expect(engine.currentScreenHasSequenceWaiting()).toBe(true);
    expect(engine.processKey("b", {})).toBe(false);
    expect(handler).toHaveBeenCalled();
    expect(engine.currentScreenHasSequenceWaiting()).toBe(false);
  });

  it("boundSequence validates length", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundSequence(["a"], () => {})).toThrow();
  });

  it("binds explicit keys with an action id and fires the action", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: handler, keys: ["a", "b"], timeout: 100 },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    const unbind = engine.boundSequence(["x", "y"], "seq");
    engine.processKey("x", {});
    expect(engine.currentScreenHasSequenceWaiting()).toBe(true);
    engine.processKey("y", {});
    expect(handler).toHaveBeenCalledWith("y", {});
    unbind();
    engine.processKey("x", {});
    engine.processKey("y", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses the explicit keys, ignoring the action's preset keys", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: handler, keys: ["a", "b"] },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundSequence(["x", "y"], "seq");
    engine.processKey("a", {});
    engine.processKey("b", {});
    expect(handler).not.toHaveBeenCalled();
    engine.processKey("x", {});
    engine.processKey("y", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not require the action to have preset keys", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.defineSequenceAction([
      { sequenceActionId: "no-keys", action: handler },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundSequence(["x", "y"], "no-keys")).not.toThrow();
    engine.processKey("x", {});
    engine.processKey("y", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws when the action id is not registered", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundSequence(["x", "y"], "missing")).toThrow(
      'Sequence action "missing" is not registered',
    );
  });

  it("throws when explicit keys are fewer than 2", () => {
    const engine = createEngine();
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: () => {}, keys: ["a", "b"] },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundSequence(["a"], "seq")).toThrow();
  });

  it("merges the action's preset timeout as a default, overridable per call", () => {
    vi.useFakeTimers();
    try {
      const engine = createEngine();
      engine.defineSequenceAction([
        { sequenceActionId: "seq", action: () => {}, keys: ["a", "b"], timeout: 100 },
      ]);
      engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });

      engine.boundSequence(["x", "y"], "seq");
      engine.processKey("x", {});
      expect(engine.currentScreenHasSequenceWaiting()).toBe(true);
      vi.advanceTimersByTime(100);
      expect(engine.currentScreenHasSequenceWaiting()).toBe(false);

      engine.boundSequence(["m", "n"], "seq", { timeout: 200 });
      engine.processKey("m", {});
      vi.advanceTimersByTime(100);
      expect(engine.currentScreenHasSequenceWaiting()).toBe(true);
      vi.advanceTimersByTime(100);
      expect(engine.currentScreenHasSequenceWaiting()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects cover:false global sequence conflicts via action id", () => {
    const engine = createEngine();
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: () => {}, keys: ["a", "b"] },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "h"], operate: () => {}, cover: false, category: [Page] },
    ]);
    expect(() => engine.boundSequence(["g", "h"], "seq")).toThrow();
  });

  it("creates and auto-activates the focus target of a focusId-scoped sequence", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundSequence(["x", "y"], handler, { focusId: "panel-alpha" });
    expect(engine.focusCurrent().result?.id).toBe("panel-alpha");
    expect(engine.focusSet("panel-alpha")).toBe(true);
    engine.processKey("x", {});
    engine.processKey("y", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("starts only the sequence of the currently focused target", () => {
    const engine = createEngine();
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundSequence(["x", "y"], handlerA, { focusId: "a" });
    engine.boundSequence(["x", "y"], handlerB, { focusId: "b" });
    engine.focusSet("b");
    engine.processKey("x", {});
    engine.processKey("y", {});
    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});

describe("OperationRegistry", () => {
  it("registers and fires global keys with times", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalKeys([{ key: "a", operate, times: 2 }]);
    engine.processKey("a", {});
    expect(operate).not.toHaveBeenCalled();
    engine.processKey("a", {});
    expect(operate).toHaveBeenCalledTimes(1);
  });

  it("registers global sequences and pending state", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalSequence([{ keys: ["g", "g"], operate }]);
    engine.processKey("g", {});
    expect(engine.thereGlobalQueueWaiting()).toBe(true);
    engine.processKey("g", {});
    expect(operate).toHaveBeenCalledTimes(1);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
  });

  it("manages shortcut and sequence actions", () => {
    const engine = createEngine();
    expect(engine.addAction({ actionId: "s", action: () => {} })).toBe(true);
    expect(engine.hasAction("s")).toBe(true);
    expect(engine.addAction({ actionId: "s", action: () => {} })).toBe(false);
    expect(engine.removeAction("s")).toBe(true);
    expect(engine.hasAction("s")).toBe(false);
    expect(engine.removeAction("s")).toBe(false);

    expect(
      engine.addSequenceAction({ sequenceActionId: "q", action: () => {} }),
    ).toBe(true);
    expect(engine.hasSequenceAction("q")).toBe(true);
    expect(
      engine.addSequenceAction({ sequenceActionId: "q", action: () => {} }),
    ).toBe(false);
    expect(engine.removeSequenceAction("q")).toBe(true);
    expect(engine.removeSequenceAction("q")).toBe(false);
  });

  it("registers a defineShortcutAction batch atomically", () => {
    const engine = createEngine();
    engine.defineShortcutAction([{ actionId: "a", action: () => {} }]);
    // A batch containing an already-registered id registers nothing.
    expect(
      engine.defineShortcutAction([
        { actionId: "b", action: () => {} },
        { actionId: "a", action: () => {} },
      ]),
    ).toBe(false);
    expect(engine.hasAction("b")).toBe(false);
    // A batch with an internal duplicate also registers nothing.
    expect(
      engine.defineShortcutAction([
        { actionId: "c", action: () => {} },
        { actionId: "c", action: () => {} },
      ]),
    ).toBe(false);
    expect(engine.hasAction("c")).toBe(false);
  });

  it("wildcard priority is reference counted", () => {
    const engine = createEngine();
    const exact = vi.fn();
    const wild = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard(["z"], exact);
    engine.boundKeyboard(["*"], wild);
    engine.processKey("z", {});
    expect(exact).toHaveBeenCalledTimes(1);
    expect(wild).not.toHaveBeenCalled();
    const disable = engine.enableWildcardPriority();
    const disable2 = engine.enableWildcardPriority();
    disable();
    engine.processKey("z", {});
    expect(wild).toHaveBeenCalledTimes(1);
    disable2();
    engine.processKey("z", {});
    expect(exact).toHaveBeenCalledTimes(2);
  });
});

describe("PipelineManager", () => {
  it("builds 9 processors and supports add/remove/reset", () => {
    const engine = createEngine();
    expect(engine.getProcessors()).toHaveLength(9);
    engine.addProcessor({
      id: "custom",
      process: () => false,
    });
    expect(engine.getProcessors()).toHaveLength(10);
    expect(engine.removeProcessor("custom")).toBe(true);
    engine.addProcessor({
      id: "custom",
      process: () => false,
    });
    engine.resetProcessors();
    expect(engine.getProcessors()).toHaveLength(9);
  });

  it("kicks and reactivates built-in processors", () => {
    const engine = createEngine();
    expect(engine.kickProcessor("screen-stack")).toBe(true);
    expect(engine.kickProcessor("screen-stack")).toBe(false);
    expect(engine.activeProcessor("screen-stack")).toBe(true);
    expect(engine.activeProcessor("screen-stack")).toBe(false);
  });

  it("re-weights a processor to reorder the pipeline", () => {
    const engine = createEngine();
    const order = () => engine.getProcessors().map((p) => p.id);
    expect(order()[0]).toBe("modal");

    // lower modal below screen-stack (weight 0) -> it sinks to the back
    expect(engine.setProcessorWeight("modal", -1)).toBe(true);
    const lowered = order();
    expect(lowered[lowered.length - 1]).toBe("modal");

    // restore it above everything else
    expect(engine.setProcessorWeight("modal", 8000)).toBe(true);
    expect(order()[0]).toBe("modal");

    // unknown id -> false, no throw
    expect(engine.setProcessorWeight("missing", 0)).toBe(false);
  });
});

describe("LayerManager", () => {
  it("cleans removed pages and layer data", () => {
    const engine = createEngine();
    const other = {};
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {});
    engine.cleanLayers();
    engine.sync({ pagePath: [other], layers: [], modalLayers: [] });
    engine.cleanLayers();
    expect(engine.readLayer(Page)).toBeUndefined();
  });

  it("manages focus targets and groups", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    const f1 = vi.fn();
    const f2 = vi.fn();
    engine.boundKeyboard(["a"], f1, { focusId: "one" });
    engine.boundKeyboard(["b"], f2, { focusId: "two" });
    expect(engine.focusCurrent().result?.id).toBe("one");
    engine.focusNext();
    expect(engine.focusCurrent().result?.id).toBe("two");
    engine.focusPrev();
    expect(engine.focusCurrent().result?.id).toBe("one");
    engine.focusSet("two");
    expect(engine.processKey("b", {})).toBe(false);
    expect(f2).toHaveBeenCalled();
    expect(engine.focusUnregister("one")).toBe(true);
    expect(engine.focusCurrent().result?.id).toBe("two");
  });

  it("clears only the owning element pending sequence", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["a1", "b1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    engine.boundSequence(["x", "y"], () => {}, { elementId: "a1" });
    engine.boundKeyboard(["b"], () => {}, {
      elementId: "b1",
      focusId: "some",
    });
    engine.popOwner("L");
    expect(engine.processKey("x", {})).toBe(true);
    expect(layerPendingOwner(engine, "L")).toBe("a1");
    engine.pushOwner("L");
    engine["layers"].focusSet("some", { element: "b1" });
    engine.popOwner("L");
    expect(layerPendingOwner(engine, "L")).toBe("a1");
  });
});

describe("KeyboardEngine composition wrappers", () => {
  it("exposes composition state and mapping methods", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(engine.composition).toBeDefined();
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: (ctx) => ({
        value: 1,
        lastFlag: "times",
        steps: [...ctx.steps, "3"],
      }),
    });
    expect(engine.removeCompositionKey("missing")).toBe(false);
    engine.clearAllCompositionKeys();
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: (ctx) => ({
        value: 1,
        lastFlag: "times",
        steps: [...ctx.steps, "3"],
      }),
    });
    engine.processKey("3", {});
    expect(engine.hasPendingComposition()).toBe(true);
    expect(engine.getCompositionContext().steps).toEqual(["3"]);
    expect(engine.abortComposition()).toBeUndefined();
    engine.setValueSchema({ times: () => true });
    engine.clearCompositionBuffers();
    expect(engine.addMapping(["x"], ["3"])).toBe(true);
    expect(engine.removeMapping("missing")).toBe(false);
    expect(engine.removeMapping("x")).toBe(true);
    expect(engine.getLastMappingEvent()).toBeNull();
    expect(engine.getLastCompositionEvent()).not.toBeNull();
  });

  it("updates composition keys through the engine wrapper", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: (ctx) => ({
        value: 1,
        lastFlag: "times",
        steps: [...ctx.steps, "3"],
      }),
    });
    expect(engine.updateCompositionKey("3", [], { alternativeFlag: "x" })).toBe(
      true,
    );
    expect(engine.updateCompositionKey("missing", [], {})).toBe(false);
  });
});

describe("OperationRegistry edge cases", () => {
  it("handles empty and null mode cycles", () => {
    const empty = createEngine();
    expect(() => empty.nextMode()).not.toThrow();
    expect(() => empty.prevMode()).not.toThrow();

    const engine = createEngine({ modes: ["normal", "insert"] });
    engine.nextMode();
    expect(engine.getCurrentMode()).toBe("normal");
    engine.prevMode();
    expect(engine.getCurrentMode()).toBe("insert");
  });

  it("idempotently disables wildcard priority", () => {
    const engine = createEngine();
    const disable = engine.enableWildcardPriority();
    disable();
    disable();
    expect(engine.getProcessors().length).toBe(9);
  });

  it("validates global key entries", () => {
    const engine = createEngine();
    expect(() =>
      engine.globalKeys([{ key: "a", operate: () => {}, times: 0 }]),
    ).toThrow();
    expect(() =>
      engine.globalKeys([{ key: "a", operate: () => {}, observer: () => {} }]),
    ).toThrow();
    expect(() => engine.globalKeys([{ key: "a", operate: "missing" }])).toThrow();
  });

  it("supports add mode and pressCount defaults", () => {
    const engine = createEngine();
    engine.globalKeys(
      [{ key: "a", operate: () => {} }],
      { mode: "add" },
    );
    engine.globalKeys(
      [{ key: "b", operate: () => {} }],
      { mode: "add" },
    );
    expect(engine.getGlobalKeys()).toHaveLength(2);
    expect(engine.getGlobalKeys()[0].pressCount).toBeUndefined();

    engine.globalSequence(
      [{ keys: ["c", "d"], operate: () => {} }],
      { mode: "add" },
    );
    engine.globalSequence(
      [{ keys: ["e", "f"], operate: () => {} }],
      { mode: "add" },
    );
    expect(engine.getGlobalSequences()).toHaveLength(2);
  });

  it("validates and replaces global sequences", () => {
    const engine = createEngine();
    expect(() =>
      engine.globalSequence([{ keys: ["a"], operate: () => {} }]),
    ).toThrow();
    expect(() =>
      engine.globalSequence([{ keys: ["a", "b"], operate: "missing" }]),
    ).toThrow();

    const first = vi.fn();
    const second = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalSequence([{ keys: ["a", "b"], operate: first }]);
    engine.processKey("a", {});
    expect(engine.thereGlobalQueueWaiting()).toBe(true);
    engine.globalSequence([{ keys: ["c", "d"], operate: second }]);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
  });

  it("validates action modifications and removals", () => {
    const engine = createEngine();
    engine.defineShortcutAction([{ actionId: "s", action: () => {} }]);
    expect(engine.modifyAction("s", ["x"])).toBe(false);
    expect(engine.modifyAction("missing", ["x"])).toBe(false);
    engine.defineShortcutAction([
      { actionId: "t", action: () => {}, keys: ["t"] },
    ]);
    expect(engine.modifyAction("t", ["u"])).toBe(true);

    engine.defineSequenceAction([{ sequenceActionId: "q", action: () => {} }]);
    expect(engine.modifySequenceAction("q", ["a", "b"])).toBe(false);
    engine.defineSequenceAction([
      { sequenceActionId: "r", action: () => {}, keys: ["r", "s"] },
    ]);
    expect(engine.modifySequenceAction("r", ["a", "b"], 100)).toBe(false);
    engine.defineSequenceAction([
      { sequenceActionId: "p", action: () => {}, keys: ["p", "q"], timeout: 100 },
    ]);
    expect(engine.modifySequenceAction("p", ["x", "y"], 200)).toBe(true);

    expect(engine.removeAction("missing")).toBe(false);
    expect(engine.removeSequenceAction("missing")).toBe(false);
    engine.addSequenceAction({
      sequenceActionId: "z",
      action: () => {},
      keys: ["z", "y"],
    });
    expect(engine.hasSequenceAction("z")).toBe(true);
    engine.clearSequenceOperations();
    engine.clearShortcutOperations();
  });

  it("leaves preset keys intact when modifySequenceAction fails on timeout", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.defineSequenceAction([
      { sequenceActionId: "r", action: handler, keys: ["r", "s"] },
    ]);
    // No default timeout → passing one fails without touching the preset keys.
    expect(engine.modifySequenceAction("r", ["a", "b"], 100)).toBe(false);

    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    // boundSequence resolves the action's preset keys: intact ["r","s"] fire,
    // a buggy ["a","b"] would not.
    engine.boundSequence("r");
    engine.processKey("r", {});
    engine.processKey("s", {});
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("reports waiting state and syncs pending listeners", () => {
    const engine = createEngine();
    const sync = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(engine.currentScreenHasSequenceWaiting()).toBe(false);
    engine.boundSequence(["a", "b"], () => {});
    engine.processKey("a", {});
    expect(engine.currentScreenHasSequenceWaiting(sync)).toBe(true);
    engine.processKey("b", {});
    expect(sync).toHaveBeenCalled();

    expect(() => engine.currentScreenHasSequenceWaiting()).not.toThrow();
    expect(engine.thereGlobalQueueWaiting(sync)).toBe(false);
  });

  it("supports monitorLayer and missing owner branches", () => {
    const engine = createEngine();
    expect(() => engine.currentScreenHasSequenceWaiting()).toThrow();

    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    engine.boundSequence(["x", "y"], () => {}, { elementId: "e1" });
    engine.popOwner("L");
    engine.processKey("x", {});
    expect(
      engine["registry"].currentScreenHasSequenceWaiting(() => {}, {
        monitorLayer: true,
      }),
    ).toBe(true);

    engine.sync({
      pagePath: [],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    expect(() =>
      engine.currentScreenHasSequenceWaiting(() => {}),
    ).toThrow();
  });
});

describe("PipelineManager insertion options", () => {
  it("inserts processors by index, before, after, and append", () => {
    const engine = createEngine();
    const ids = () => engine.getProcessors().map((p) => p.id);
    engine.addProcessor({ id: "by-index", process: () => false }, { index: 0 });
    expect(ids()[0]).toBe("by-index");
    const shiftedModalIndex = ids().indexOf("modal");
    engine.addProcessor({ id: "before-layer", process: () => false }, {
      before: "layer",
    });
    expect(ids()).toContain("before-layer");
    engine.addProcessor({ id: "after-modal", process: () => false }, {
      after: "modal",
    });
    expect(ids().indexOf("after-modal")).toBe(shiftedModalIndex + 1);
    expect(engine.addProcessor({ id: "appended", process: () => false })).toBe(
      true,
    );
    expect(ids().at(-1)).toBe("appended");
    expect(
      engine.addProcessor({ id: "by-index", process: () => false }),
    ).toBe(false);
    expect(
      engine.addProcessor({ id: "missing-target", process: () => false }, {
        before: "missing",
      }),
    ).toBe(false);
  });

  it("builds a pipeline from constructor processors", () => {
    const engine = new KeyboardEngine({
      normalizeKeyNames: (input) => (input ? [input] : []),
      isNormalChar: () => false,
      processors: [{ processor: { id: "custom", process: () => false } }],
    });
    expect(engine.getProcessors().map((p) => p.id)).toContain("custom");
  });
});

describe("BindingService edge cases", () => {
  it("requires an active screen for bindings", () => {
    const engine = createEngine();
    expect(() => engine.boundKeyboard(["a"], () => {})).toThrow();
    expect(() => engine.penetration(["a"])).toThrow();
    expect(() => engine.stop(["a"])).toThrow();
  });

  it("resolves action ids with explicit keys", () => {
    const engine = createEngine();
    const action = vi.fn();
    engine.defineShortcutAction([
      { actionId: "save", action, keys: ["s"] },
      { actionId: "no-keys", action },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundKeyboard("no-keys", {})).toThrow();
    expect(engine.boundKeyboard("save", {})).toBeInstanceOf(Function);
    engine.processKey("s", {});
    expect(action).toHaveBeenCalled();
  });

  it("enforces global key cover rules", () => {
    const engine = createEngine();
    const globalOperate = vi.fn();
    const pageHandler = vi.fn();
    engine.globalKeys([{ key: "g", operate: globalOperate, cover: false }]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundKeyboard(["g"], pageHandler)).toThrow();

    engine.globalKeys([{ key: "h", operate: globalOperate, cover: true }]);
    engine.boundKeyboard(["h"], pageHandler);
    expect(engine.processKey("h", {})).toBe(false);
    expect(globalOperate).not.toHaveBeenCalled();
    expect(pageHandler).toHaveBeenCalled();

    engine.globalKeys([
      { key: "o", operate: globalOperate, cover: false, affectLayer: true },
    ]);
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    expect(() =>
      engine.boundKeyboard(["o"], pageHandler, { elementId: "e1" }),
    ).toThrow();
    engine.popOwner("L");
  });

  it("supports modal miss listener cleanup and misuse", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(engine.useModalMissListener(() => {})).toBeInstanceOf(Function);

    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    const remove = engine.useModalMissListener(() => {}, { elementId: "e1" });
    remove();
    engine.popOwner("L");

    engine.pushOwner("L");
    expect(() => engine.useModalMissListener(() => {})).toThrow();
    engine.popOwner("L");
  });

  it("binds sequence actions and rejects global sequence conflicts", () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: handler, keys: ["a", "b"], timeout: 100 },
    ]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    const unbind = engine.boundSequence("seq");
    expect(engine.processKey("a", {})).toBe(false);
    expect(engine.processKey("b", {})).toBe(false);
    expect(handler).toHaveBeenCalled();
    unbind();

    engine.globalSequence([
      { keys: ["g", "h"], operate: () => {}, cover: false },
    ]);
    expect(() => engine.boundSequence(["g", "h"], () => {})).toThrow();
  });

  it("throws when a layer owner has no page and no element id", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    expect(() => engine.boundKeyboard(["x"], () => {})).toThrow(
      "No Page currently exists",
    );
    engine.popOwner("L");
  });

  it("throws when explicit keys reference a missing action", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    expect(() => engine.boundKeyboard(["x"], "missing")).toThrow();
  });

  it("applies global key overrides only for matching categories and phases", () => {
    const engine = createEngine();
    const globalOp = vi.fn();
    const handler = vi.fn();
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalKeys([
      { key: "a", operate: globalOp, cover: true, category: [] },
      { key: "b", operate: globalOp, cover: true, category: ["other"] },
      { key: "c", operate: globalOp, cover: true, category: [Page] },
      { key: "d", operate: globalOp, cover: true, affectLayer: true },
    ]);
    engine.boundKeyboard(["a"], handler);
    engine.boundKeyboard(["b"], handler);
    engine.boundKeyboard(["c"], handler);
    engine.boundKeyboard(["d"], handler);
    engine.processKey("a", {});
    engine.processKey("b", {});
    engine.processKey("c", {});
    engine.processKey("d", {});
    expect(handler).toHaveBeenCalledTimes(4);
    expect(globalOp).not.toHaveBeenCalled();
  });

  it("supports string keys and action stop with focus ids", () => {
    const engine = createEngine();
    const action = vi.fn();
    engine.defineShortcutAction([{ actionId: "s", action, keys: ["x"] }]);
    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.boundKeyboard("x", action);
    engine.processKey("x", {});
    expect(action).toHaveBeenCalled();

    engine.boundKeyboard(["x"], "s", { focusId: "one" });
    expect(() =>
      engine.stop(["s"], { stopAction: true, focusId: "one" }),
    ).not.toThrow();
    engine.boundKeyboard(["y"], "s", {
      focusId: { group: "g", focusId: "one" },
    });
    expect(() =>
      engine.stop(["s"], {
        stopAction: true,
        focusId: { group: "g", focusId: "one" },
      }),
    ).not.toThrow();
  });

  it("reports overlay stop action errors with overlay names", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    expect(() =>
      engine.stop(["missing"], { stopAction: true, elementId: "e1" }),
    ).toThrow();
    engine.popOwner("L");
  });

  it("requires an owner for allowModal", () => {
    const engine = createEngine();
    expect(() => engine.allowModal(["x"])).toThrow();
  });

  it("validates sequence actions and owners", () => {
    const engine = createEngine();
    expect(() => engine.boundSequence("missing")).toThrow();
    engine.defineSequenceAction([
      { sequenceActionId: "no-keys", action: () => {} },
    ]);
    expect(() => engine.boundSequence("no-keys")).toThrow();
    expect(() => engine.boundSequence(["a", "b"], () => {})).toThrow();

    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.defineSequenceAction([
      { sequenceActionId: "seq", action: () => {}, keys: ["a", "b"], timeout: 100 },
    ]);
    engine.boundSequence("seq", { timeout: 200 });
    engine.processKey("a", {});
    engine.processKey("b", {});
  });

  it("rejects page and overlay sequence conflicts with cover false", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.globalSequence([
      { keys: ["g", "h"], operate: () => {}, cover: false, affectLayer: true },
    ]);
    engine.pushOwner("L");
    expect(() =>
      engine.boundSequence(["g", "h"], () => {}, { elementId: "e1" }),
    ).toThrow();
    engine.popOwner("L");

    engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["c", "d"], operate: () => {}, cover: false, category: ["other"] },
    ]);
    expect(() => engine.boundSequence(["c", "d"], () => {})).not.toThrow();
    engine.globalSequence([
      { keys: ["e", "f"], operate: () => {}, cover: false, category: [Page] },
    ]);
    expect(() => engine.boundSequence(["e", "f"], () => {})).toThrow();
  });

  it("defaults miss listener options", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Page],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    const remove = engine.useModalMissListener(() => {}, { elementId: "e1" });
    remove();
    engine.popOwner("L");
  });
});
