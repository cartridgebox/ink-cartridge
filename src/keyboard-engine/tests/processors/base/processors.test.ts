import { describe, expect, it, vi } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Root = {};
const Child = {};

describe("layer processor", () => {
  it("broadcasts a key to every active element in the top layer", () => {
    const engine = createEngine();
    const a1 = vi.fn();
    const a2 = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("A", ["a1", "a2"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    engine.boundKeyboard(["x"], a1, { elementId: "a1" });
    engine.boundKeyboard(["x"], a2, { elementId: "a2" });
    engine.popOwner("A");

    expect(engine.processKey("x", {})).toBe(true);
    expect(a1).toHaveBeenCalled();
    expect(a2).toHaveBeenCalled();
  });

  it("bubbles to the next lower layer when the top layer misses", () => {
    const engine = createEngine();
    const a = vi.fn();
    const b = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("B", ["b1"]), makeSyncLayer("A", ["a1"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    engine.boundKeyboard(["y"], a, { elementId: "a1" });
    engine.popOwner("A");
    engine.pushOwner("B");
    engine.boundKeyboard(["x"], b, { elementId: "b1" });
    engine.popOwner("B");

    expect(engine.processKey("x", {})).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it("gives stop priority over penetration", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("A", ["a1"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    engine.penetration(["x"], { elementId: "a1" });
    engine.stop(["x"], { elementId: "a1" });
    engine.popOwner("A");
    engine.boundKeyboard(["x"], page);

    expect(engine.processKey("x", {})).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });

  it("keeps a key stopped while another holder of the same stop rule remains", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("A", ["a1"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    const stopOne = engine.stop(["x"], { elementId: "a1" });
    engine.stop(["x"], { elementId: "a1" });
    engine.popOwner("A");
    engine.boundKeyboard(["x"], page);

    stopOne();
    expect(engine.processKey("x", {})).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });

  it("gives sequences priority over ordinary bindings in the same layer", () => {
    const engine = createEngine();
    const seq = vi.fn();
    const ordinaryX = vi.fn();
    const ordinaryY = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("A", ["seq", "ord"])],
      modalLayers: [],
    });
    engine.pushOwner("A");
    engine.boundSequence(["x", "y"], seq, { elementId: "seq" });
    engine.boundKeyboard(["x"], ordinaryX, { elementId: "ord" });
    engine.boundKeyboard(["y"], ordinaryY, { elementId: "ord" });
    engine.popOwner("A");

    expect(engine.processKey("x", {})).toBe(true);
    expect(ordinaryX).not.toHaveBeenCalled();
    expect(engine.processKey("y", {})).toBe(true);
    expect(seq).toHaveBeenCalledTimes(1);
    expect(ordinaryY).not.toHaveBeenCalled();
  });
});

describe("modal processor", () => {
  it("blocks the page while a modal binding handles the key", () => {
    const engine = createEngine();
    const modal = vi.fn();
    const page = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["x"], page);
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.boundKeyboard(["x"], modal, { elementId: "m1" });
    engine.popOwner("M");

    expect(engine.processKey("x", {})).toBe(true);
    expect(modal).toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  });

  it("passes allowed keys through to the page", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["t"], page);
    engine.pushOwner("M");
    engine.allowModal(["t"], { elementId: "m1" });
    engine.popOwner("M");

    expect(engine.processKey("t", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("passes a focus target's enabled allowModal key through to the page", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["x"], page);
    engine.pushOwner("M");
    engine.allowModal(["x"], {
      elementId: "m1",
      focusId: { group: "g1", focusId: "ft1" },
    });
    engine.popOwner("M");

    expect(engine.processKey("x", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("blocks a focus target's when-disabled allowModal key from penetrating", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["x"], page);
    engine.pushOwner("M");
    engine.allowModal(["x"], {
      elementId: "m1",
      focusId: { group: "g1", focusId: "ft1" },
      when: () => false,
    });
    engine.popOwner("M");

    expect(engine.processKey("x", {})).toBe(true);
    expect(page).not.toHaveBeenCalled();
  });

  it("scopes a when-disabled allowModal rule to its own focus target", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["t"], page);
    engine.pushOwner("M");
    engine.allowModal(["t"], { elementId: "m1", focusId: "ft0" });
    engine.allowModal(["t"], {
      elementId: "m1",
      focusId: { group: "g", focusId: "ft1" },
      when: () => false,
    });
    engine.popOwner("M");

    // Both targets are active. The group's disabled rule is its own refusal,
    // not a veto of the default target's unconditional allow.
    expect(engine.processKey("t", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("keeps a layer-level allow when a focus target disables the key", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["t"], page);
    engine.pushOwner("M");
    engine.allowModal(["t"], { elementId: "m1" });
    engine.allowModal(["t"], {
      elementId: "m1",
      focusId: "ft0",
      when: () => false,
    });
    engine.popOwner("M");

    expect(engine.processKey("t", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("reports modal misses through miss listeners", () => {
    const engine = createEngine();
    const onMiss = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.useModalMissListener(onMiss, { elementId: "m1" });
    engine.popOwner("M");

    expect(engine.processKey("z", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith(
      expect.objectContaining({ miss: true, eventNames: ["z"] }),
    );
  });
});

describe("global processors", () => {
  it("skips overlay-phase global keys when no layer is active", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalKeys([{ key: "a", operate, affectLayer: true }]);
    expect(engine.processKey("a", {})).toBe(false);
    expect(operate).not.toHaveBeenCalled();

    engine.globalKeys([
      { key: "a", operate, affectLayer: true, executeWhenNoOverlay: true },
    ]);
    expect(engine.processKey("a", {})).toBe(true);
    expect(operate).toHaveBeenCalledTimes(1);
  });

  it("disambiguates global sequences sharing a first key", () => {
    const engine = createEngine();
    const first = vi.fn();
    const second = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "a"], operate: first },
      { keys: ["g", "b"], operate: second },
    ]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("b", {})).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("screen stack processor", () => {
  it("lets the top page win and stops iteration", () => {
    const engine = createEngine();
    const rootHandler = vi.fn();
    const childHandler = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["x"], rootHandler);
    engine.sync({ pagePath: [Root, Child], layers: [], modalLayers: [] });
    engine.boundKeyboard(["x"], childHandler);

    expect(engine.processKey("x", {})).toBe(false);
    expect(childHandler).toHaveBeenCalled();
    expect(rootHandler).not.toHaveBeenCalled();
  });
});

describe("global sequence edge cases", () => {
  it("filters by mode, category, top component and overlay availability", () => {
    const engine = createEngine({
      modes: ["normal", "insert"],
      defaultMode: "normal",
    });
    const operate = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([{ keys: ["a", "b"], operate, mode: "insert" }]);
    expect(engine.processKey("a", {})).toBe(false);

    engine.globalSequence([{ keys: ["a", "b"], operate, category: [] }]);
    expect(engine.processKey("a", {})).toBe(false);

    engine.globalSequence([
      { keys: ["a", "b"], operate, category: ["other"] },
    ]);
    expect(engine.processKey("a", {})).toBe(false);

    engine.globalSequence([{ keys: ["a", "b"], operate, affectLayer: true }]);
    expect(engine.processKey("a", {})).toBe(false);

    engine.globalSequence([
      { keys: ["a", "b"], operate, affectLayer: true, executeWhenNoOverlay: true },
    ]);
    expect(engine.processKey("a", {})).toBe(true);
    expect(operate).not.toHaveBeenCalled();
  });

  it("skips global sequences when top component is absent", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.globalSequence([{ keys: ["a", "b"], operate }]);
    expect(engine.processKey("a", {})).toBe(false);
    expect(operate).not.toHaveBeenCalled();
  });

  it("skips global sequences overridden by layer and screen bindings", () => {
    const engine = createEngine();
    const globalOp = vi.fn();
    const layerHandler = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    engine.boundSequence(["g", "h"], layerHandler, { elementId: "e1" });
    engine.popOwner("L");
    engine.globalSequence([
      { keys: ["g", "i"], operate: globalOp, affectLayer: true },
    ]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("i", {})).toBe(false);
    expect(globalOp).not.toHaveBeenCalled();

    const screenHandler = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundSequence(["s", "t"], screenHandler);
    engine.globalSequence([{ keys: ["s", "u"], operate: globalOp }]);
    expect(engine.processKey("s", {})).toBe(false);
    expect(engine.processKey("u", {})).toBe(false);
    expect(globalOp).not.toHaveBeenCalled();
  });

  it("expires global sequence timers", () => {
    vi.useFakeTimers();
    const engine = createEngine();
    const sync = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([{ keys: ["a", "b"], operate: () => {} }]);
    engine.processKey("a", {});
    expect(engine.thereGlobalQueueWaiting(sync)).toBe(true);
    vi.advanceTimersByTime(600);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
    expect(sync).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("clears an overlay pending when the overlay closes", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.globalSequence([
      { keys: ["a", "b"], operate: () => {}, affectLayer: true },
    ]);
    engine.processKey("a", {});
    expect(engine.thereGlobalQueueWaiting()).toBe(true);
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    expect(engine.processKey("b", {})).toBe(false);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
  });

  it("clears a pending global sequence when its condition turns false", () => {
    const engine = createEngine();
    engine.addCondition("cond", true);
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["a", "b"], operate: () => {}, when: "cond" },
    ]);
    engine.processKey("a", {});
    engine.setCondition("cond", false);
    expect(engine.processKey("b", {})).toBe(false);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
  });

  it("narrows expected global sequence candidates", () => {
    const first = vi.fn();
    const second = vi.fn();
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "a", "x"], operate: first },
      { keys: ["g", "a", "y"], operate: second },
    ]);
    engine.processKey("g", {});
    engine.processKey("a", {});
    engine.processKey("x", {});
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("restarts a global sequence from a matching candidate", () => {
    const first = vi.fn();
    const second = vi.fn();
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "c", "d"], operate: first },
      { keys: ["g", "b", "e"], operate: second },
    ]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("b", {})).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(engine.processKey("e", {})).toBe(true);
    expect(second).toHaveBeenCalled();
  });

  it("cancels a single global sequence on mismatch", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([{ keys: ["a", "b"], operate }]);
    engine.processKey("a", {});
    expect(engine.processKey("z", {})).toBe(false);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
  });

  it("supports exclusive mismatches and cover false", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["a", "b"], operate, exclusive: true },
    ]);
    engine.processKey("a", {});
    expect(engine.processKey("z", {})).toBe(true);
    expect(engine.thereGlobalQueueWaiting()).toBe(true);
    engine.processKey("b", {});
    expect(operate).toHaveBeenCalledTimes(1);

    engine.globalSequence([
      { keys: ["c", "d"], operate, cover: false },
    ]);
    expect(engine.processKey("c", {})).toBe(true);
    engine.processKey("d", {});
    expect(operate).toHaveBeenCalledTimes(2);
  });

  it("cancels global candidate sequences on no match", () => {
    const first = vi.fn();
    const second = vi.fn();
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "c", "d"], operate: first },
      { keys: ["g", "b", "e"], operate: second },
    ]);
    engine.processKey("g", {});
    expect(engine.processKey("z", {})).toBe(false);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("keeps multiple global candidates and expires their timer", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalSequence([
      { keys: ["g", "c", "d"], operate: first },
      { keys: ["g", "b", "d"], operate: second },
      { keys: ["g", "b", "e"], operate: third },
    ]);
    engine.processKey("g", {});
    expect(engine.processKey("b", {})).toBe(true);
    expect(engine.getGlobalPendingSequence()?.candidates).toHaveLength(2);
    vi.advanceTimersByTime(600);
    expect(engine.thereGlobalQueueWaiting()).toBe(false);
    vi.useRealTimers();
  });
});

describe("modal processor edge cases", () => {
  it("passes allowed keys from active focus targets", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["t"], page);
    engine.pushOwner("M");
    engine.allowModal(["t"], { elementId: "m1", focusId: "one" });
    engine.boundKeyboard(["u"], () => {}, {
      elementId: "m1",
      focusId: "one",
    });
    engine.popOwner("M");
    expect(engine.processKey("t", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("passes allowed keys from group focus targets", () => {
    const engine = createEngine();
    const page = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.boundKeyboard(["t"], page);
    engine.pushOwner("M");
    engine.allowModal(["t"], {
      elementId: "m1",
      focusId: { group: "g", focusId: "one" },
    });
    engine.boundKeyboard(["u"], () => {}, {
      elementId: "m1",
      focusId: { group: "g", focusId: "one" },
    });
    engine.popOwner("M");
    expect(engine.processKey("t", {})).toBe(false);
    expect(page).toHaveBeenCalled();
  });

  it("reports handled modal events as miss false", () => {
    const engine = createEngine();
    const onMiss = vi.fn();
    const handler = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.useModalMissListener(onMiss, { elementId: "m1" });
    engine.boundKeyboard(["x"], handler, { elementId: "m1" });
    engine.popOwner("M");
    expect(engine.processKey("x", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith({ miss: false });
    expect(handler).toHaveBeenCalled();
  });

  it("reports when-blocked bindings as misses", () => {
    const engine = createEngine();
    const onMiss = vi.fn();
    engine.addCondition("ok", true);
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.useModalMissListener(onMiss, {
      elementId: "m1",
      monitorWhen: true,
    });
    engine.boundKeyboard(["x"], () => {}, { elementId: "m1", when: "ok" });
    engine.boundKeyboard(["y"], () => {}, {
      elementId: "m1",
      focusId: "one",
      when: "ok",
    });
    engine.popOwner("M");
    engine.setCondition("ok", false);
    expect(engine.processKey("x", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith(
      expect.objectContaining({ miss: true, eventNames: ["x"] }),
    );
    onMiss.mockClear();
    expect(engine.processKey("y", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith(
      expect.objectContaining({ miss: true, eventNames: ["y"] }),
    );
  });

  it("reports focus mismatches as misses", () => {
    const engine = createEngine();
    const onMiss = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.useModalMissListener(onMiss, {
      elementId: "m1",
      monitorFocusMismatch: true,
    });
    engine.boundKeyboard(["a"], () => {}, {
      elementId: "m1",
      focusId: "active",
    });
    engine.boundKeyboard(["z"], () => {}, {
      elementId: "m1",
      focusId: "other",
    });
    engine.popOwner("M");
    expect(engine.processKey("z", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith(
      expect.objectContaining({ miss: true, eventNames: ["z"] }),
    );
  });

  it("reports group focus mismatches as misses", () => {
    const engine = createEngine();
    const onMiss = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.useModalMissListener(onMiss, {
      elementId: "m1",
      monitorFocusMismatch: true,
    });
    engine.boundKeyboard(["a"], () => {}, {
      elementId: "m1",
      focusId: { group: "g", focusId: "active" },
    });
    engine.boundKeyboard(["z"], () => {}, {
      elementId: "m1",
      focusId: { group: "g", focusId: "other" },
    });
    engine.popOwner("M");
    expect(engine.processKey("z", {})).toBe(true);
    expect(onMiss).toHaveBeenCalledWith(
      expect.objectContaining({ miss: true, eventNames: ["z"] }),
    );
  });

  it("consumes modal events without element keyboards", () => {
    const engine = createEngine();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    expect(engine.processKey("x", {})).toBe(true);

    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", [])],
    });
    engine.pushOwner("M");
    engine.boundKeyboard(["x"], () => {}, { elementId: "m1" });
    engine.popOwner("M");
    expect(engine.processKey("x", {})).toBe(true);
  });

  it("handles modal sequences", () => {
    const engine = createEngine();
    const seq = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [],
      modalLayers: [makeSyncLayer("M", ["m1"])],
    });
    engine.pushOwner("M");
    engine.boundSequence(["a", "b"], seq, { elementId: "m1" });
    engine.popOwner("M");
    expect(engine.processKey("a", {})).toBe(true);
    expect(engine.processKey("b", {})).toBe(true);
    expect(seq).toHaveBeenCalled();
  });
});

describe("global key and processor guards", () => {
  it("skips global keys overridden by overlay and screen bindings", () => {
    const engine = createEngine();
    const globalOp = vi.fn();
    const pageHandler = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.globalKeys([
      { key: "g", operate: globalOp, affectLayer: true, cover: true },
    ]);
    engine.pushOwner("L");
    engine.boundKeyboard(["g"], pageHandler, { elementId: "e1" });
    engine.popOwner("L");
    expect(engine.processKey("g", {})).toBe(true);
    expect(globalOp).not.toHaveBeenCalled();

    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalKeys([{ key: "h", operate: globalOp, cover: true }]);
    engine.boundKeyboard(["h"], pageHandler);
    expect(engine.processKey("h", {})).toBe(false);
    expect(pageHandler).toHaveBeenCalled();
    expect(globalOp).not.toHaveBeenCalled();
  });

  it("kicks built-in processors", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.globalKeys([{ key: "g", operate }]);
    engine.kickProcessor("global-key-screen");
    expect(engine.processKey("g", {})).toBe(false);
    expect(operate).not.toHaveBeenCalled();

    engine.kickProcessor("global-sequence-screen");
    engine.kickProcessor("composition-screen");
    engine.kickProcessor("screen-stack");
    engine.kickProcessor("layer");
    expect(engine.processKey("x", {})).toBe(false);
  });

  it("fires overlay global keys without element keyboards and skips bad conditions", () => {
    const engine = createEngine();
    const operate = vi.fn();
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.globalKeys([{ key: "g", operate, affectLayer: true }]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(operate).toHaveBeenCalled();

    const whenEngine = createEngine();
    const blocked = vi.fn();
    whenEngine.addCondition("off", false);
    whenEngine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    whenEngine.globalKeys([{ key: "h", operate: blocked, when: "off" }]);
    expect(whenEngine.processKey("h", {})).toBe(false);
    expect(blocked).not.toHaveBeenCalled();

    const arrayEngine = createEngine();
    const arrayOp = vi.fn();
    arrayEngine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    arrayEngine.globalKeys([{ key: ["i", "j"], operate: arrayOp }]);
    expect(arrayEngine.processKey("j", {})).toBe(true);
    expect(arrayOp).toHaveBeenCalled();

    const noTop = createEngine();
    const noTopOp = vi.fn();
    noTop.globalKeys([{ key: "k", operate: noTopOp }]);
    expect(noTop.processKey("k", {})).toBe(false);
    expect(noTopOp).not.toHaveBeenCalled();
  });
});
