import { describe, expect, it, vi } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Root = {};
const Other = {};

function pendingOwner(
  engine: ReturnType<typeof createEngine>,
  layerId: string,
): string | null {
  const layer = engine["layers"].readLayer(layerId);
  if (!layer || !("elementKeyboards" in layer)) return null;
  return (
    layer.pendingSequence as unknown as { fromElementId: string | null }
  ).fromElementId;
}

describe("LayerManager lifecycle", () => {
  it("creates and reads page and element layers", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.boundKeyboard(["x"], () => {});
    expect(engine.readLayer(Root)).toBeDefined();
    engine.pushOwner("L");
    engine.boundKeyboard(["y"], () => {}, { elementId: "e1" });
    engine.popOwner("L");
    expect(engine.readLayer("L")).toBeDefined();
    expect(engine.readLayer("L", "e1")).toBeDefined();
    expect(engine.readLayer("L", "missing")).toBeUndefined();
  });

  it("cleans page layers after navigation", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["x"], () => {});
    engine.cleanLayers();
    engine.sync({ pagePath: [Other], layers: [], modalLayers: [] });
    engine.cleanLayers();
    expect(engine.readLayer(Root)).toBeUndefined();
  });

  it("cleans removed element keyboards and their pending sequences", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    engine.boundSequence(["a", "b"], () => {}, { elementId: "e1" });
    engine.popOwner("L");
    engine.cleanOverlayLayers();
    expect(engine.processKey("a", {})).toBe(true);
    expect(pendingOwner(engine, "L")).toBe("e1");

    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", [])],
      modalLayers: [],
    });
    engine.cleanOverlayLayers();
    expect(engine.readLayer("L", "e1")).toBeUndefined();
  });

  it("cleans modal layers after they close", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.boundKeyboard(["x"], () => {}, { elementId: "m1" });
    engine.popOwner("M");
    engine.cleanModalLayers();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.cleanModalLayers();
    expect(engine.readLayer("M")).toBeUndefined();
  });
});

describe("LayerManager owner stack", () => {
  it("pushes, pops and unwinds nested owners with lastIndexOf", () => {
    const engine = createEngine();
    engine.pushOwner("A");
    engine.pushOwner("A");
    engine.pushOwner("B");
    engine.popOwner("A");
    engine.popOwner("B");
    engine.popOwner("A");
    expect(() => engine.popOwner("missing")).not.toThrow();
  });
});

describe("LayerManager focus", () => {
  it("reports noOwner / noLayer / noFound states", () => {
    const engine = createEngine();
    expect(engine.focusCurrent().noOwner).toBe(true);
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    expect(engine.focusCurrent().noLayer).toBe(true);
    engine.boundKeyboard(["x"], () => {});
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("cycles default focus and groups", () => {
    const engine = createEngine();
    const f1 = vi.fn();
    const f2 = vi.fn();
    const g1 = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], f1, { focusId: "one" });
    engine.boundKeyboard(["b"], f2, { focusId: "two" });
    engine.boundKeyboard(["c"], g1, {
      focusId: { group: "g", focusId: "ga" },
    });

    expect(engine.focusCurrent().result?.id).toBe("one");
    engine.focusNext();
    expect(engine.focusCurrent().result?.id).toBe("two");
    engine.focusPrev();
    expect(engine.focusCurrent().result?.id).toBe("one");
    engine.focusSet("two");
    engine.processKey("b", {});
    expect(f2).toHaveBeenCalled();

    engine.focusSet("ga", "g");
    expect(engine.focusCurrent("g").result?.id).toBe("ga");
    expect(engine.focusCurrent("g").result?.fromGroup).toBe("g");
    expect(engine.focusUnregister("one")).toBe(true);
    expect(engine.focusUnregister("one")).toBe(false);
    expect(engine.focusCurrent().result?.id).toBe("two");
  });

  it("handles unknown groups and targets", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(engine.focusSet("missing")).toBe(false);
    expect(engine.focusCurrent("missing-group")).toEqual({ noFound: true });
    expect(engine.focusNext("missing-group")).toBe(false);
    expect(engine.focusPrev("missing-group")).toBe(false);
    expect(engine.focusUnregister("missing-group")).toBe(false);
  });

  it("supports activateFocusGroup and kickFocusGroup", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "ga" },
    });
    engine.kickFocusGroup("g");
    expect(engine.focusCurrent("g").noFound).toBe(true);
    expect(engine.activateFocusGroup("ga", "g")).toBe(true);
    expect(engine.activateFocusGroup("ga", "g")).toBe(false);
    expect(engine.kickFocusGroup("g")).toBe(true);
    expect(engine.kickFocusGroup("g")).toBe(false);
  });

  it("notifies subscribers on focus changes", () => {
    const engine = createEngine();
    const subscriber = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unsubscribe = engine.subscribeFocus(subscriber);
    engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(subscriber).toHaveBeenCalled();
    unsubscribe();
    engine.boundKeyboard(["b"], () => {}, { focusId: "two" });
    const calls = subscriber.mock.calls.length;
    engine.focusSet("one");
    expect(subscriber.mock.calls.length).toBe(calls);
  });
});

describe("LayerManager cleanup branches", () => {
  it("cleans a page pending sequence after navigation", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundSequence(["a", "b"], () => {});
    engine.processKey("a", {});
    engine.cleanLayers();
    engine.sync({ pagePath: [Other], layers: [], modalLayers: [] });
    engine.cleanLayers();
    expect(engine.readLayer(Root)).toBeUndefined();
  });

  it("cleans removed layer and modal keyboards with pending timers", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    engine.boundSequence(["a", "b"], () => {}, { elementId: "e1" });
    engine.popOwner("L");
    engine.processKey("a", {});
    engine.cleanOverlayLayers();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.cleanOverlayLayers();
    expect(engine.readLayer("L")).toBeUndefined();

    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.boundSequence(["c", "d"], () => {}, { elementId: "m1" });
    engine.popOwner("M");
    engine.processKey("c", {});
    engine.cleanModalLayers();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.cleanModalLayers();
    expect(engine.readLayer("M")).toBeUndefined();
  });

  it("cleans removed modal elements and their pending sequences", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1", "m2"])],
    });
    engine.pushOwner("M");
    engine.boundSequence(["a", "b"], () => {}, { elementId: "m1" });
    engine.popOwner("M");
    engine.processKey("a", {});
    engine.cleanModalLayers();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m2"])],
    });
    engine.cleanModalLayers();
    expect(engine.readLayer("M", "m1")).toBeUndefined();
  });

  it("clears a pending sequence when its owning element is focused", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
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
    engine.processKey("x", {});
    expect(pendingOwner(engine, "L")).toBe("a1");

    engine.pushOwner("L");
    engine["layers"].focusSet("some", { element: "b1" });
    engine.popOwner("L");
    expect(pendingOwner(engine, "L")).toBe("a1");

    engine.pushOwner("L");
    engine.boundKeyboard(["a"], () => {}, {
      elementId: "a1",
      focusId: "aFocus",
    });
    engine["layers"].focusSet("aFocus", { element: "a1" });
    engine.popOwner("L");
    expect(pendingOwner(engine, "L")).toBeNull();
  });

  it("clears a page pending sequence on focus changes", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundSequence(["a", "b"], () => {});
    engine.boundKeyboard(["x"], () => {}, { focusId: "one" });
    engine.processKey("a", {});
    expect(engine["layers"].readLayer(Root)?.pendingSequence).not.toBeNull();
    engine.focusSet("one");
    expect(engine["layers"].readLayer(Root)?.pendingSequence).toBeNull();
  });
});

describe("LayerManager group focus branches", () => {
  it("auto-activates new targets in an empty group and cycles groups", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const f1 = vi.fn();
    const f2 = vi.fn();
    const f3 = vi.fn();
    engine.boundKeyboard(["a"], f1, {
      focusId: { group: "g", focusId: "one" },
    });
    engine.boundKeyboard(["b"], f2, {
      focusId: { group: "g", focusId: "two" },
    });
    expect(engine.focusCurrent("g").result?.id).toBe("one");
    expect(engine.focusNext("g")).toBe(true);
    expect(engine.focusCurrent("g").result?.id).toBe("two");
    expect(engine.focusPrev("g")).toBe(true);
    expect(engine.focusCurrent("g").result?.id).toBe("one");
    engine.kickFocusGroup("g");
    engine.boundKeyboard(["c"], f3, {
      focusId: { group: "g", focusId: "three" },
    });
    expect(engine.focusCurrent("g").result?.id).toBe("three");
  });

  it("no-ops for missing groups and targets and replaces group focus", () => {
    const engine = createEngine();
    expect(engine.focusSet("one")).toBe(false);
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "one" },
    });
    expect(engine.focusSet("x", "missing")).toBe(false);
    expect(engine.focusSet("missing", "g")).toBe(false);
    // "one" is already the active member of g — setting it again is a no-op.
    expect(engine.focusSet("one", "g")).toBe(false);
    engine.boundKeyboard(["b"], () => {}, {
      focusId: { group: "g", focusId: "two" },
    });
    // Moving to a different member of g actually changes focus.
    expect(engine.focusSet("two", "g")).toBe(true);
    expect(engine.focusCurrent("g").result?.id).toBe("two");
  });

  it("does not report a move when a group holds a single target", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "one" },
    });
    // Cycling wraps back to the same target — focus did not move.
    expect(engine.focusNext("g")).toBe(false);
    expect(engine.focusPrev("g")).toBe(false);
    engine.boundKeyboard(["b"], () => {}, { focusId: "solo" });
    expect(engine.focusSet("solo")).toBe(true); // activate the default group
    expect(engine.focusNext()).toBe(false);
    expect(engine.focusPrev()).toBe(false);
    expect(engine.focusCurrent().result?.id).toBe("solo");
  });

  it("unregisters group focus targets and auto-activates the next", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "one" },
    });
    engine.boundKeyboard(["b"], () => {}, {
      focusId: { group: "g", focusId: "two" },
    });
    expect(engine.focusUnregister("one", "g")).toBe(true);
    expect(engine.focusCurrent("g").result?.id).toBe("two");
    expect(engine.focusUnregister("two", "g")).toBe(true);
    expect(engine.focusCurrent("g").noFound).toBe(true);
    expect(engine.focusUnregister("missing", "g")).toBe(false);
  });

  it("activates focus groups lazily and returns false when active", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(engine.activateFocusGroup("one")).toBe(false);
    engine.kickFocusGroup();
    expect(engine.activateFocusGroup("one")).toBe(true);
    expect(engine.activateFocusGroup("one")).toBe(false);
    expect(engine.activateFocusGroup("missing")).toBe(false);
    expect(engine.activateFocusGroup("one", "missing")).toBe(false);
  });

  it("kicks default and group focus", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(engine.kickFocusGroup()).toBe(true);
    expect(engine.kickFocusGroup()).toBe(false);
    expect(engine.kickFocusGroup("missing")).toBe(false);
  });

  it("reports no owner for focus mutation methods", () => {
    const engine = createEngine();
    expect(engine.focusNext()).toBe(false);
    expect(engine.focusPrev()).toBe(false);
    expect(engine.focusUnregister("one")).toBe(false);
    expect(engine.activateFocusGroup("one")).toBe(false);
    expect(engine.kickFocusGroup()).toBe(false);
  });

  it("unregisters the last default focus target", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(engine.focusUnregister("one")).toBe(true);
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("no-ops focusSet on an emptied group", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "one" },
    });
    expect(engine.focusUnregister("one", "g")).toBe(true);
    expect(engine.focusSet("missing", "g")).toBe(false);
  });
});
