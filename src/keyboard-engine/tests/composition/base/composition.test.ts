import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../_helpers/factories.js";

const Root = {};

afterEach(() => {
  vi.useRealTimers();
});

function engineWithChain() {
  const engine = createEngine();
  engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
  engine.registryCompositionKey({
    key: "3",
    flags: [],
    alternativeFlag: "times",
    needs: [],
    execute: (ctx) => ({
      value: 3,
      lastFlag: "times",
      steps: [...ctx.steps, "3"],
    }),
  });
  engine.registryCompositionKey({
    key: "w",
    flags: [],
    alternativeFlag: "action",
    needs: ["times"],
    optional: true,
    execute: (ctx) => ({
      value: ctx.value,
      lastFlag: "action",
      steps: [...ctx.steps, "w"],
    }),
  });
  return engine;
}

describe("CompositionEngine", () => {
  it("accumulates context through a head and chain key", () => {
    vi.useFakeTimers();
    const engine = engineWithChain();
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.hasPendingComposition()).toBe(true);
    expect(engine.getCompositionContext().steps).toEqual(["3"]);
    expect(engine.processKey("w", {})).toBe(true);
    expect(engine.getCompositionContext().value).toBe(3);
    expect(engine.getCompositionContext().steps).toEqual(["3", "w"]);
    vi.advanceTimersByTime(600);
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("runs an optional head key alone", () => {
    const engine = engineWithChain();
    expect(engine.processKey("w", {})).toBe(true);
    expect(engine.getCompositionContext().steps).toEqual(["w"]);
  });

  it("aborts a pending chain", () => {
    const engine = engineWithChain();
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.hasPendingComposition()).toBe(true);
    engine.abortComposition();
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("does not record a broken chain, and abort is a no-op with nothing pending", () => {
    const engine = engineWithChain();
    const subscriber = vi.fn();
    engine.subscribeComposition(subscriber);

    // Nothing pending: abort emits nothing at all.
    engine.abortComposition();
    expect(subscriber).not.toHaveBeenCalled();
    expect(engine.getLastCompositionEvent()).toBeNull();

    // A mismatched key breaks the chain and releases the key.
    engine.processKey("3", {});
    expect(engine.processKey("z", {})).toBe(false);
    expect(engine.getLastCompositionEvent()?.type).toBe("broken");

    // The dropped chain is not undoable, and aborting afterwards must not
    // record it either.
    engine.abortComposition();
    expect(engine.bufferedCompositionCount()).toBe(0);
    expect(engine.getLastCompositionEvent()?.type).toBe("broken");
  });

  it("clears a pending chain when undo runs mid-composition", () => {
    vi.useFakeTimers();
    const engine = engineWithChain();
    engine.processKey("3", {});
    expect(engine.hasPendingComposition()).toBe(true);
    // undo while the chain is still pending: the pending entry must be
    // cleared, otherwise startPending() stays blocked until the stale
    // timeout fires.
    expect(engine.undoComposition()).toBeNull();
    expect(engine.hasPendingComposition()).toBe(false);
    // a fresh chain must be able to start immediately afterwards.
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.hasPendingComposition()).toBe(true);
    vi.advanceTimersByTime(600);
    expect(engine.hasPendingComposition()).toBe(false);
  });

  it("publishes composition events", () => {
    const engine = engineWithChain();
    const subscriber = vi.fn();
    engine.subscribeComposition(subscriber);
    engine.processKey("3", {});
    expect(subscriber).toHaveBeenCalled();
    expect(engine.getLastCompositionEvent()?.type).toBe("started");
  });

  it("buffers completed chains and undoes them", () => {
    vi.useFakeTimers();
    const engine = engineWithChain();
    engine.processKey("3", {});
    engine.processKey("w", {});
    vi.advanceTimersByTime(600);
    expect(engine.bufferedCompositionCount()).toBe(1);
    const undone = engine.undoComposition();
    expect(undone).not.toBeNull();
    expect(engine.bufferedCompositionCount()).toBe(0);
  });

  it("maps an external sequence to a composition chain", () => {
    const engine = engineWithChain();
    expect(engine.addMapping(["3", "w"], ["3", "w"])).toBe(true);
    const subscriber = vi.fn();
    engine.subscribeMapping(subscriber);
    expect(engine.processKey("3", {})).toBe(true);
    expect(engine.processKey("w", {})).toBe(true);
    expect(subscriber).toHaveBeenCalled();
    expect(engine.removeMappingKey(["3", "w"])).toBe(true);
  });

  it("supports value schemas and updateCompositionKey", () => {
    const engine = engineWithChain();
    engine.setValueSchema({ times: (v): v is number => typeof v === "number" });
    expect(
      engine.updateCompositionKey("3", [], { alternativeFlag: "times" }),
    ).toBe(true);
    expect(engine.updateCompositionKey("missing", [], {})).toBe(false);
  });
});
