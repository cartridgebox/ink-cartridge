import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveCompositionKey,
  type CompositionKey,
} from "../../../src/CompositionEngine.js";
import { createEngine } from "../../_helpers/factories.js";

const Root = {};

afterEach(() => {
  vi.useRealTimers();
});

function syncEngine(options: Parameters<typeof createEngine>[0] = {}) {
  const engine = createEngine(options);
  engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
  return engine;
}

function head(
  engine: ReturnType<typeof createEngine>,
  key = "3",
  extra: Partial<CompositionKey<unknown>> = {},
) {
  engine.registryCompositionKey({
    key,
    flags: [],
    alternativeFlag: "times",
    needs: [],
    execute: (ctx) => ({
      value: 1,
      lastFlag: "times",
      steps: [...ctx.steps, key],
    }),
    ...extra,
  } as CompositionKey<unknown>);
}

function chain(
  engine: ReturnType<typeof createEngine>,
  key = "w",
  extra: Partial<CompositionKey<unknown>> = {},
) {
  engine.registryCompositionKey({
    key,
    flags: [],
    alternativeFlag: "action",
    needs: ["times"],
    execute: (ctx) => ({
      value: ctx.value,
      lastFlag: "action",
      steps: [...ctx.steps, key],
    }),
    ...extra,
  } as CompositionKey<unknown>);
}

describe("resolveCompositionKey", () => {
  it("returns null for empty or incompatible pools", () => {
    const entry = {
      key: "a",
      flags: [],
      alternativeFlag: "x",
      needs: ["p"],
    } as CompositionKey<unknown>;
    expect(resolveCompositionKey([], null)).toBeNull();
    expect(resolveCompositionKey([entry], null)).toBeNull();
    expect(resolveCompositionKey([entry], "other")).toBeNull();
  });

  it("prefers optional head entries and stricter contracts", () => {
    const optional = {
      key: "a",
      flags: [],
      alternativeFlag: "x",
      needs: ["p"],
      optional: true,
    } as CompositionKey<unknown>;
    const needless = {
      key: "b",
      flags: [],
      alternativeFlag: "y",
      needs: [],
    } as CompositionKey<unknown>;
    expect(resolveCompositionKey([optional, needless], null)?.key).toBe("a");

    const shorter = {
      key: "c",
      flags: [],
      alternativeFlag: "z",
      needs: ["p"],
    } as CompositionKey<unknown>;
    const longer = {
      key: "c",
      flags: [],
      alternativeFlag: "q",
      needs: ["p", "q"],
    } as CompositionKey<unknown>;
    expect(resolveCompositionKey([shorter, longer], "p")?.key).toBe("c");
  });

  it("prefers more specific modifier keys", () => {
    const plain = {
      key: "s",
      flags: [],
      alternativeFlag: "x",
      needs: ["p"],
    } as CompositionKey<unknown>;
    const ctrl = {
      key: "ctrl+s",
      flags: [],
      alternativeFlag: "y",
      needs: ["p"],
    } as CompositionKey<unknown>;
    expect(resolveCompositionKey([plain, ctrl], "p")?.key).toBe("ctrl+s");
  });
});

describe("mapping registration", () => {
  it("registers, deduplicates and removes mapping keys", () => {
    const engine = syncEngine();
    head(engine);
    expect(engine.addMapping([], ["3"])).toBe(false);
    expect(engine.addMapping(["g"], ["missing"])).toBe(false);
    expect(engine.addMapping(["g"], ["3"])).toBe(true);
    expect(engine.addMapping(["g"], ["3"])).toBe(false);
    expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);
    expect(engine.removeMappingKey(["missing"])).toBe(false);
    expect(engine.removeMappingKey(["g", "h"])).toBe(true);
    expect(engine.removeMapping("g")).toBe(true);
    expect(engine.removeMapping("g")).toBe(false);
  });

  it("returns false when a key sequence shares the head but differs", () => {
    const engine = syncEngine();
    head(engine);
    expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);
    // Head key 'g' is registered, but no sequence 'g','j' exists.
    expect(engine.removeMappingKey(["g", "j"])).toBe(false);
    // The registered sequence is left intact.
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("h", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");
  });
});

describe("mapping execution", () => {
  it("runs a single-key mapping immediately", () => {
    const engine = syncEngine();
    const subscriber = vi.fn();
    engine.subscribeMapping(subscriber);
    head(engine);
    expect(engine.addMapping(["g"], ["3"])).toBe(true);
    expect(engine.processKey("g", {})).toBe(true);
    expect(subscriber).toHaveBeenCalled();
    expect(engine.getLastMappingEvent()?.type).toBe("completed");
  });

  it("stops notifying a mapping subscriber after unsubscribe", () => {
    const engine = syncEngine();
    const subscriber = vi.fn();
    const unsubscribe = engine.subscribeMapping(subscriber);
    head(engine);
    engine.addMapping(["g"], ["3"]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(subscriber).toHaveBeenCalled();

    subscriber.mockClear();
    unsubscribe();
    expect(engine.processKey("g", {})).toBe(true);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it("starts and completes a multi-key mapping", () => {
    const engine = syncEngine();
    head(engine);
    chain(engine);
    expect(engine.addMapping(["g", "h"], ["3", "w"])).toBe(true);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("started");
    expect(engine.processKey("h", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");
  });

  it("disambiguates mapping candidates and supports exclusive mismatches", () => {
    const engine = syncEngine();
    head(engine);
    engine.addMapping(["g", "h"], ["3"]);
    engine.addMapping(["g", "k"], ["3"]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("h", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");

    engine.addMapping(["x", "y"], ["3"], { exclusive: true });
    expect(engine.processKey("x", {})).toBe(true);
    expect(engine.processKey("z", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("consumed");
    expect(engine.processKey("y", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");
  });

  it("keeps mapping candidates ambiguous and locks longer sequences", () => {
    const engine = syncEngine();
    head(engine);
    engine.addMapping(["g", "h", "i"], ["3"]);
    engine.addMapping(["g", "h", "j"], ["3"]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("h", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("continued");
    expect(engine.processKey("i", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");

    engine.addMapping(["x", "y", "z"], ["3"]);
    expect(engine.processKey("x", {})).toBe(true);
    expect(engine.processKey("y", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("continued");
    expect(engine.processKey("z", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("completed");
  });

  it("breaks mapping chains and honours key release", () => {
    const engine = syncEngine();
    engine.registryCompositionKey({
      key: "bad",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: () => null,
    } as CompositionKey<unknown>);
    expect(engine.addMapping(["g"], ["bad"])).toBe(true);
    expect(engine.processKey("g", {})).toBe(false);
    expect(engine.getLastMappingEvent()?.type).toBe("broken");

    engine.registryCompositionKey({
      key: "bad2",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: () => null,
    } as CompositionKey<unknown>);
    expect(
      engine.addMapping(["h"], ["bad2"], {
        KeyReleaseWhenChainInterrupted: true,
      }),
    ).toBe(true);
    expect(engine.processKey("h", {})).toBe(true);
    expect(engine.getLastMappingEvent()?.type).toBe("broken");

    engine.registryCompositionKey({
      key: "filtered",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      category: ["other"],
      execute: () => ({ value: 1, lastFlag: "times", steps: [] }),
    } as CompositionKey<unknown>);
    expect(engine.addMapping(["x"], ["filtered"])).toBe(true);
    expect(engine.processKey("x", {})).toBe(false);
  });

  it("breaks non-exclusive mapping pending on mismatch", () => {
    const engine = syncEngine();
    head(engine);
    engine.addMapping(["g", "h"], ["3"]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("z", {})).toBe(false);
    expect(engine.getLastMappingEvent()?.type).toBe("broken");
  });

  it("filters mapping entries by mode, overlay, category and top component", () => {
    const engine = syncEngine({
      modes: ["normal", "insert"],
      defaultMode: "normal",
    });
    head(engine);
    expect(engine.addMapping(["a"], ["3"], { mode: "insert" })).toBe(true);
    expect(engine.processKey("a", {})).toBe(false);
    expect(engine.addMapping(["b"], ["3"], { category: ["other"] })).toBe(true);
    expect(engine.processKey("b", {})).toBe(false);
    expect(engine.addMapping(["c"], ["3"], { category: [Root] })).toBe(true);
    expect(engine.processKey("c", {})).toBe(true);
    expect(engine.addMapping(["d"], ["3"], { affectOverlay: true })).toBe(true);
    expect(engine.processKey("d", {})).toBe(false);
    head(engine, "3o", { affectOverlay: true, executeWhenNoOverlay: true });
    expect(
      engine.addMapping(["e"], ["3o"], {
        affectOverlay: true,
        executeWhenNoOverlay: true,
      }),
    ).toBe(true);
    expect(engine.processKey("e", {})).toBe(true);

    const noTop = createEngine();
    noTop.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: (ctx) => ({ value: 1, lastFlag: "times", steps: [...ctx.steps, "3"] }),
    });
    expect(noTop.addMapping(["f"], ["3"])).toBe(true);
    expect(noTop.processKey("f", {})).toBe(false);
  });
});

describe("composition events and registration", () => {
  it("notifies only subscribed composition listeners", () => {
    const engine = syncEngine();
    const sub = vi.fn();
    const unsubscribe = engine.subscribeComposition(sub);
    head(engine);
    engine.processKey("3", {});
    expect(sub).toHaveBeenCalled();
    const calls = sub.mock.calls.length;
    unsubscribe();
    engine.abortComposition();
    expect(sub.mock.calls.length).toBe(calls);
    expect(engine.getLastCompositionEvent()?.type).toBe("aborted");
  });

  it("keeps mapping and composition subscribers separate", () => {
    const engine = syncEngine();
    const compositionSub = vi.fn();
    const mappingSub = vi.fn();
    engine.subscribeComposition(compositionSub);
    engine.subscribeMapping(mappingSub);
    head(engine);
    engine.addMapping(["g"], ["3"]);
    engine.processKey("g", {});
    expect(mappingSub).toHaveBeenCalled();
    expect(compositionSub).not.toHaveBeenCalled();
    mappingSub.mockClear();
    engine.processKey("3", {});
    expect(compositionSub).toHaveBeenCalled();
    expect(mappingSub).not.toHaveBeenCalled();
  });

  it("deduplicates composition entries by fingerprint and updates keys", () => {
    const engine = syncEngine();
    const first = vi.fn((ctx) => ({
      value: 1,
      lastFlag: "times",
      steps: [...ctx.steps, "3"],
    }));
    const second = vi.fn((ctx) => ({
      value: 2,
      lastFlag: "times",
      steps: [...ctx.steps, "3"],
    }));
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: first,
    } as CompositionKey<unknown>);
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: second,
    } as CompositionKey<unknown>);
    engine.processKey("3", {});
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    expect(engine.updateCompositionKey("3", [], { alternativeFlag: "x" })).toBe(
      true,
    );
    expect(
      engine.updateCompositionKey("3", [{ need: "a", become: "b" }], {}),
    ).toBe(false);
    expect(engine.updateCompositionKey("missing", [], {})).toBe(false);
    expect(engine.removeCompositionKey("3")).toBe(true);
    expect(engine.removeCompositionKey("3")).toBe(false);
    engine.clearAllCompositionKeys();
  });

  it("stores distinct entries that share the same key", () => {
    const engine = syncEngine();
    // Two entries under "3": a head that sets lastFlag 'times', and a chain
    // entry that needs 'times'. They differ by fingerprint, so both are kept.
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
    engine.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "action",
      needs: ["times"],
      execute: (ctx) => ({
        value: ctx.value,
        lastFlag: "action",
        steps: [...ctx.steps, "3"],
      }),
    });

    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.processKey("3", {})).toBe(true);
    // The second press continued via the chain entry, not a fresh head.
    expect(engine.getCompositionContext().steps).toEqual(["3", "3"]);
  });
});

describe("composition lifecycle", () => {
  it("aborts, buffers and clears composition history", () => {
    const engine = syncEngine();
    head(engine);
    expect(engine.hasPendingComposition()).toBe(false);
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.hasPendingComposition()).toBe(true);
    expect(engine.getCompositionContext().steps).toEqual(["3"]);
    engine.abortComposition();
    expect(engine.hasPendingComposition()).toBe(false);
    expect(engine.bufferedCompositionCount()).toBe(1);
    expect(engine.getLastCompositionEvent()?.type).toBe("aborted");
    engine.clearCompositionBuffers();
    expect(engine.bufferedCompositionCount()).toBe(0);
    expect(engine.getLastCompositionEvent()?.type).toBe("cleared");
  });

  it("completes pending chains on timeout", () => {
    vi.useFakeTimers();
    const engine = syncEngine();
    const sub = vi.fn();
    engine.subscribeComposition(sub);
    head(engine);
    engine.processKey("3", {});
    vi.advanceTimersByTime(600);
    expect(engine.hasPendingComposition()).toBe(false);
    expect(engine.bufferedCompositionCount()).toBe(1);
    expect(engine.getLastCompositionEvent()?.type).toBe("completed");
    expect(sub).toHaveBeenCalled();
  });

  it("honours when conditions for head and continuation keys", () => {
    const engine = syncEngine();
    engine.addCondition("on", false);
    head(engine, "3", { when: "on" });
    expect(engine.processKey("3", {})).toBe(false);
    engine.setCondition("on", true);
    expect(engine.processKey("3", {})).toBe(true);
    engine.setCondition("on", false);
    chain(engine, "w", { when: "on" });
    expect(engine.processKey("w", {})).toBe(false);
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("consumes exclusive mismatches and breaks non-exclusive chains", () => {
    const engine = syncEngine();
    head(engine, "3", { exclusive: true });
    chain(engine);
    engine.processKey("3", {});
    expect(engine.processKey("z", {})).toBe(true);
    expect(engine.getLastCompositionEvent()?.type).toBe("consumed");
    expect(engine.hasPendingComposition()).toBe(true);
    expect(engine.processKey("w", {})).toBe(true);
    engine.abortComposition();

    const broken = syncEngine();
    const screen = vi.fn();
    broken.boundKeyboard(["z"], screen);
    head(broken);
    broken.processKey("3", {});
    expect(broken.processKey("z", {})).toBe(false);
    expect(screen).toHaveBeenCalled();
    expect(broken.getLastCompositionEvent()?.type).toBe("broken");
    expect(broken.hasPendingComposition()).toBe(false);
  });

  it("stops a chain when an end key matches", () => {
    const engine = syncEngine();
    head(engine);
    chain(engine, "w", { isEndKey: ["times"] });
    engine.processKey("3", {});
    expect(engine.processKey("w", {})).toBe(false);
    expect(engine.hasPendingComposition()).toBe(false);
    expect(engine.bufferedCompositionCount()).toBe(1);
  });

  it("chooses the flag transition declared by the key", () => {
    const engine = syncEngine();
    head(engine);
    engine.registryCompositionKey({
      key: "w",
      flags: [{ need: "times", become: "chained" }],
      alternativeFlag: "fallback",
      needs: ["times"],
      execute: (ctx) => ({
        value: ctx.value,
        lastFlag: null,
        steps: [...ctx.steps, "w"],
      }),
    } as CompositionKey<unknown>);
    engine.processKey("3", {});
    engine.processKey("w", {});
    expect(engine.getCompositionContext().lastFlag).toBe("chained");
  });

  it("filters composition entries by overlay, mode, category and top component", () => {
    const engine = syncEngine({
      modes: ["normal", "insert"],
      defaultMode: "normal",
    });
    head(engine, "a", { mode: "insert" });
    expect(engine.processKey("a", {})).toBe(false);
    head(engine, "b", { category: [] });
    expect(engine.processKey("b", {})).toBe(false);
    head(engine, "c", { category: ["other"] });
    expect(engine.processKey("c", {})).toBe(false);
    head(engine, "d", { category: [Root] });
    expect(engine.processKey("d", {})).toBe(true);
    head(engine, "e", { affectOverlay: true });
    expect(engine.processKey("e", {})).toBe(false);
    head(engine, "f", { affectOverlay: true, executeWhenNoOverlay: true });
    expect(engine.processKey("f", {})).toBe(true);
  });
});

describe("composition undo", () => {
  it("undoes buffered sequences in flat and isolated modes", () => {
    const engine = syncEngine();
    head(engine);
    chain(engine);
    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    expect(engine.undoComposition()).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(0);

    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    expect(engine.bufferedCompositionCount()).toBe(2);
    expect(engine.undoComposition(2, { isolated: true })).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(0);
  });

  it("undoes by key and throws when exceeding buffers", () => {
    const engine = syncEngine();
    head(engine);
    engine.processKey("3", {});
    engine.abortComposition();
    engine.processKey("3", {});
    engine.abortComposition();
    expect(() => engine.undoComposition(3, { byKey: true })).toThrow();
    expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(1);
    expect(
      engine.undoComposition(1, { byKey: true, isolated: true }),
    ).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(0);
  });

  it("partially removes keys from a sequence", () => {
    const engine = syncEngine();
    head(engine);
    chain(engine);
    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(1);
    expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(0);
  });

  it("runs custom undo actions and stops when they return null", () => {
    const engine = syncEngine();
    const undoAction = vi.fn(() => ({
      value: 0,
      lastFlag: "times",
      steps: [],
    }));
    head(engine, "3", { undoAction });
    engine.processKey("3", {});
    engine.abortComposition();
    expect(engine.undoComposition()).not.toBeNull();
    expect(undoAction).toHaveBeenCalled();

    const stopUndo = vi.fn(() => null);
    head(engine, "4", { undoAction: stopUndo });
    engine.processKey("4", {});
    engine.abortComposition();
    expect(engine.undoComposition(1, { isolated: true })).toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(1);
  });
});

describe("composition value schemas", () => {
  it("validates head and continuation output", () => {
    const engine = syncEngine();
    engine.setValueSchema({ times: () => false });
    head(engine);
    expect(engine.processKey("3", {})).toBe(false);
    expect(engine.hasPendingComposition()).toBe(false);

    engine.setValueSchema({ times: () => true, action: () => false });
    chain(engine);
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.processKey("w", {})).toBe(false);
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("clears pending when continuation input fails validation", () => {
    const engine = syncEngine();
    engine.setValueSchema({ times: () => true, action: () => true });
    head(engine);
    chain(engine, "w");
    chain(engine, "q", { KeyReleaseWhenChainInterrupted: true });
    engine.processKey("3", {});
    engine.setValueSchema({ times: () => false, action: () => true });
    expect(engine.processKey("w", {})).toBe(false);
    expect(engine.hasPendingComposition()).toBe(false);

    engine.setValueSchema({ times: () => true, action: () => true });
    engine.processKey("3", {});
    engine.setValueSchema({ times: () => false, action: () => true });
    expect(engine.processKey("q", {})).toBe(true);
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("stops undo when value schema rejects input or output", () => {
    const engine = syncEngine();
    engine.setValueSchema({ times: () => true, action: () => true });
    head(engine);
    chain(engine, "w", {
      undoAction: () => ({ value: 0, lastFlag: "action", steps: [] }),
    });
    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    engine.setValueSchema({ times: () => true, action: () => false });
    expect(engine.undoComposition(1, { isolated: true })).toBeNull();
  });
});

describe("composition branch coverage", () => {
  it("handles undo without buffers and excess steps", () => {
    const engine = syncEngine();
    head(engine);
    expect(engine.undoComposition()).toBeNull();
    engine.processKey("3", {});
    engine.abortComposition();
    expect(() => engine.undoComposition(2)).toThrow();
  });

  it("stops flat undo when an undo action returns null", () => {
    const engine = syncEngine();
    const stopUndo = vi.fn(() => null);
    head(engine, "3", { undoAction: stopUndo });
    engine.processKey("3", {});
    engine.abortComposition();
    expect(engine.undoComposition()).not.toBeNull();
    expect(stopUndo).toHaveBeenCalled();
  });

  it("stops by-key undo when an undo action returns null", () => {
    const engine = syncEngine();
    const stopUndo = vi.fn(() => null);
    head(engine, "3", { undoAction: stopUndo });
    engine.processKey("3", {});
    engine.abortComposition();
    expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
    expect(engine.undoComposition(1, { byKey: true, isolated: true })).toBeNull();
  });

  it("stops undo when output schema rejects a custom undo result", () => {
    const engine = syncEngine();
    engine.setValueSchema({ times: () => true, action: () => false });
    engine.registryCompositionKey({
      key: "w",
      flags: [],
      alternativeFlag: "action",
      needs: ["times"],
      execute: (ctx) => ({
        value: ctx.value,
        lastFlag: "times",
        steps: [...ctx.steps, "w"],
      }),
      undoAction: () => ({ value: "bad", lastFlag: "action", steps: [] }),
    } as CompositionKey<unknown>);
    head(engine);
    engine.processKey("3", {});
    engine.processKey("w", {});
    engine.abortComposition();
    expect(engine.undoComposition(1, { isolated: true })).toBeNull();
  });

  it("rejects flags with the same length but different values", () => {
    const engine = syncEngine();
    head(engine, "3", { flags: [{ need: "a", become: "b" }] });
    expect(
      engine.updateCompositionKey("3", [{ need: "a", become: "c" }], {}),
    ).toBe(false);
  });

  it("passes values when schema guards are missing", () => {
    const engine = syncEngine();
    engine.setValueSchema({ other: () => false });
    head(engine);
    chain(engine);
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.processKey("w", {})).toBe(true);
  });

  it("sets mapping target flags automatically and validates output", () => {
    const auto = syncEngine();
    auto.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: (ctx) => ({ value: 1, lastFlag: null, steps: [...ctx.steps, "3"] }),
    } as CompositionKey<unknown>);
    auto.addMapping(["g"], ["3"]);
    expect(auto.processKey("g", {})).toBe(true);

    const invalid = syncEngine();
    invalid.setValueSchema({ times: () => false });
    invalid.registryCompositionKey({
      key: "3",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: () => ({ value: 1, lastFlag: "times", steps: [] }),
    } as CompositionKey<unknown>);
    invalid.addMapping(["g"], ["3"]);
    expect(invalid.processKey("g", {})).toBe(false);
  });

  it("breaks mapping target chains on missing and incompatible targets", () => {
    const removed = syncEngine();
    head(removed);
    removed.addMapping(["g"], ["3"]);
    removed.removeCompositionKey("3");
    expect(removed.processKey("g", {})).toBe(false);

    const incompatible = syncEngine();
    incompatible.registryCompositionKey({
      key: "a",
      flags: [],
      alternativeFlag: "x",
      needs: ["p"],
      execute: (ctx) => ({ value: 1, lastFlag: "x", steps: [...ctx.steps, "a"] }),
    } as CompositionKey<unknown>);
    incompatible.addMapping(["g"], ["a"]);
    expect(incompatible.processKey("g", {})).toBe(false);

    const secondMismatch = syncEngine();
    head(secondMismatch);
    secondMismatch.registryCompositionKey({
      key: "q",
      flags: [],
      alternativeFlag: "other",
      needs: ["other"],
      execute: (ctx) => ({ value: 1, lastFlag: "other", steps: [...ctx.steps, "q"] }),
    } as CompositionKey<unknown>);
    secondMismatch.addMapping(["g", "h"], ["3", "q"]);
    expect(secondMismatch.processKey("g", {})).toBe(true);
    expect(secondMismatch.processKey("h", {})).toBe(false);
    expect(secondMismatch.getLastMappingEvent()?.type).toBe("broken");
  });

  it("breaks mapping chains when a later execute returns null", () => {
    const engine = syncEngine();
    head(engine);
    engine.registryCompositionKey({
      key: "q",
      flags: [],
      alternativeFlag: "other",
      needs: ["times"],
      execute: () => null,
    } as CompositionKey<unknown>);
    engine.addMapping(["g", "h"], ["3", "q"]);
    expect(engine.processKey("g", {})).toBe(true);
    expect(engine.processKey("h", {})).toBe(false);
    expect(engine.getLastMappingEvent()?.type).toBe("broken");
  });

  it("uses empty current keys for mapping events", () => {
    const exclusive = syncEngine();
    head(exclusive);
    exclusive.addMapping(["g", "h"], ["3"], { exclusive: true });
    exclusive.processKey("g", {});
    expect(exclusive.processKey("", {})).toBe(true);
    expect(exclusive.getLastMappingEvent()?.type).toBe("consumed");

    const broken = syncEngine();
    head(broken);
    broken.addMapping(["g", "h"], ["3"]);
    broken.processKey("g", {});
    expect(broken.processKey("", {})).toBe(false);
    expect(broken.getLastMappingEvent()?.type).toBe("broken");
  });

  it("handles null execute and automatic flags when starting", () => {
    const engine = syncEngine();
    engine.registryCompositionKey({
      key: "a",
      flags: [],
      alternativeFlag: "times",
      needs: [],
      execute: () => null,
    } as CompositionKey<unknown>);
    expect(engine.processKey("a", {})).toBe(false);

    head(engine, "b", {
      execute: (ctx) => ({
        value: 1,
        lastFlag: null,
        steps: [...ctx.steps, "b"],
      }),
    });
    expect(engine.processKey("b", {})).toBe(true);
    expect(engine.getCompositionContext().lastFlag).toBe("times");
  });

  it("honours KeyReleaseWhenChainInterrupted on execute failures", () => {
    const released = syncEngine();
    head(released);
    chain(released, "w", { execute: () => null });
    released.processKey("3", {});
    expect(released.processKey("w", {})).toBe(false);

    const swallowed = syncEngine();
    head(swallowed);
    chain(swallowed, "w", {
      execute: () => null,
      KeyReleaseWhenChainInterrupted: true,
    });
    swallowed.processKey("3", {});
    expect(swallowed.processKey("w", {})).toBe(true);
  });

  it("honours KeyReleaseWhenChainInterrupted on end and schema failures", () => {
    const end = syncEngine();
    head(end);
    chain(end, "w", {
      isEndKey: ["times"],
      KeyReleaseWhenChainInterrupted: true,
    });
    end.processKey("3", {});
    expect(end.processKey("w", {})).toBe(true);

    const schema = syncEngine();
    schema.setValueSchema({ times: () => true, action: () => false });
    head(schema);
    chain(schema, "w", { KeyReleaseWhenChainInterrupted: true });
    schema.processKey("3", {});
    expect(schema.processKey("w", {})).toBe(true);
  });

  it("uses empty current keys for composition events", () => {
    const exclusive = syncEngine();
    head(exclusive, "3", { exclusive: true });
    exclusive.processKey("3", {});
    expect(exclusive.processKey("", {})).toBe(true);
    expect(exclusive.getLastCompositionEvent()?.type).toBe("consumed");

    const broken = syncEngine();
    head(broken);
    broken.processKey("3", {});
    expect(broken.processKey("", {})).toBe(false);
    expect(broken.getLastCompositionEvent()?.type).toBe("broken");
  });
});
