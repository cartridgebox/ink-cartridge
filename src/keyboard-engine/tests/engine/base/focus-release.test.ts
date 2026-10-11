import { describe, expect, it } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Root = {};

describe("releaseFocusWhenEmpty", () => {
  it("keeps an emptied focus target when the option is off", () => {
    const engine = createEngine();
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbind = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    unbind();
    expect(engine.focusCurrent().result?.id).toBe("one");
  });

  it("removes the target when its last binding unbinds", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbind = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    expect(engine.focusCurrent().result?.id).toBe("one");

    unbind();
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("hands focus to the group's next target when the active one is released", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindOne = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    engine.boundKeyboard(["b"], () => {}, { focusId: "two" });
    expect(engine.focusCurrent().result?.id).toBe("one");

    unbindOne();
    expect(engine.focusCurrent().result?.id).toBe("two");
  });

  it("restores a group's focus when its only target is re-registered", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    // Another group stays focused throughout, so only the released group's own
    // focus slot can bring its target back.
    engine.boundKeyboard(["d"], () => {}, { focusId: "d" });
    const unbind = engine.boundKeyboard(["a"], () => {}, {
      focusId: { group: "g", focusId: "ga" },
    });
    engine.focusSet("ga", "g");
    expect(engine.focusCurrent("g").result?.id).toBe("ga");

    unbind();
    engine.boundKeyboard(["b"], () => {}, {
      focusId: { group: "g", focusId: "ga" },
    });
    expect(engine.focusCurrent("g").result?.id).toBe("ga");
  });

  it("keeps a shared target while another binding still holds it", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindA = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    const unbindB = engine.boundKeyboard(["b"], () => {}, { focusId: "one" });

    unbindA();
    expect(engine.focusCurrent().result?.id).toBe("one");

    unbindB();
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("releases one reference per cleanup even when called twice", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindA = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });
    engine.boundKeyboard(["b"], () => {}, { focusId: "one" });

    // A `once` binding unbinds itself from inside the handler and the caller's
    // cleanup still runs, so the same reference is released twice there.
    unbindA();
    unbindA();
    expect(engine.focusCurrent().result?.id).toBe("one");
  });

  it("releases the target of a once-only binding when it fires", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const fired: string[] = [];
    const unbind = engine.boundKeyboard(["a"], () => fired.push("fired"), {
      focusId: "one",
      once: true,
    });

    engine.processKey("a", {});
    expect(fired).toEqual(["fired"]);
    expect(engine.focusCurrent().noFound).toBe(true);

    // The caller's cleanup runs after the self-unbind — still one reference.
    unbind();
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("does not remove a different target re-registered under the same id", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindA = engine.boundKeyboard(["a"], () => {}, { focusId: "one" });

    engine.focusUnregister("one");
    engine.boundKeyboard(["b"], () => {}, { focusId: "one" });

    // The stale reference belongs to the dropped target, not to the one now
    // registered under the same id — removing by id alone would kill it.
    unbindA();
    expect(engine.focusCurrent().result?.id).toBe("one");
  });

  it("releases a named-group target independently of the default group", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    engine.boundKeyboard(["a"], () => {}, { focusId: "d" });
    const unbindGroup = engine.boundKeyboard(["b"], () => {}, {
      focusId: { group: "g", focusId: "ga" },
    });

    unbindGroup();
    expect(engine.focusCurrent("g").noFound).toBe(true);
    expect(engine.focusCurrent().result?.id).toBe("d");
  });

  it("counts a sequence binding as a holder", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindSequence = engine.boundSequence(["g", "g"], () => {}, {
      focusId: "seq",
    });
    const unbindKey = engine.boundKeyboard(["a"], () => {}, { focusId: "seq" });

    unbindKey();
    expect(engine.focusCurrent().result?.id).toBe("seq");

    unbindSequence();
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("counts penetration and stop rules as holders", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
    const unbindPenetration = engine.penetration(["x"], { focusId: "two" });
    const unbindStop = engine.stop(["y"], { focusId: "two" });

    unbindPenetration();
    expect(engine.focusCurrent().result?.id).toBe("two");

    unbindStop();
    expect(engine.focusCurrent().noFound).toBe(true);
  });

  it("registers no focus target for a binding that throws", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });

    // A throw hands back no cleanup, so a target created before the failing
    // validation would be auto-activated and never released.
    expect(() =>
      engine.stop(["missing-action"], { stopAction: true, focusId: "one" }),
    ).toThrow();
    expect(() =>
      engine.boundKeyboard(["a"], "missing-action", { focusId: "two" }),
    ).toThrow();

    expect(engine.focusCurrent().noFound).toBe(true);
    expect(engine.readLayer(Root)?.defaultTargets.size).toBe(0);
  });

  it("releases on the layer that registered the binding, not the current owner", () => {
    const engine = createEngine({ releaseFocusWhenEmpty: true });
    engine.sync({
      pagePath: [Root],
      layers: [makeSyncLayer("L", ["e1"])],
      modalLayers: [],
    });
    engine.pushOwner("L");
    const unbind = engine.boundKeyboard(["a"], () => {}, {
      elementId: "e1",
      focusId: "inner",
    });
    engine.popOwner("L");

    // Binding cleanups run outside the React owner push; here an unrelated
    // owner is on top, which owner-based resolution would have picked instead.
    engine.pushOwner("other");
    unbind();
    engine.popOwner("other");

    expect(engine.readLayer("L", "e1")?.defaultTargets.has("inner")).toBe(false);
    expect(engine.readLayer("L", "e1")?.defaultFocusOrder).toEqual([]);
  });
});
