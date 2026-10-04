import { describe, expect, it, vi } from "vitest";
import { checkWhen } from "../../../src/checkWhen.js";
import { checkGlobalKey } from "../../../src/checkGlobalKey.js";
import { isNormalCharacter } from "../../../src/isNormalCharacter.js";
import {
  handleLayer,
  handleTabNavigation,
  keyMatchesRule,
  tryMatchBindings,
} from "../../../src/layerHandler.js";
import { handlerElement } from "../../../src/elementParser.js";
import {
  defaultTargetsSymbol,
} from "../../../src/types/default-targets-symbol.js";
import {
  cleanupGlobalKeyOverrides,
  deleteIfPresent,
  finalizeBoundKeyboard,
  modifyEntryKeys,
  pushKeyEntries,
  removeKeysFromActionMap,
  setIfAbsent,
} from "../../../src/providers/helpers.js";
import {
  makeBinding,
  makeContext,
  makeElementKeyboard,
  makeFocusTarget,
  makeKeyRule,
  makeLayerKeyboard,
  makePageBinding,
  makePageLayer,
  makePageSequenceBinding,
} from "../../_helpers/factories.js";

describe("checkWhen", () => {
  it("handles undefined, functions and named conditions", () => {
    const conditions = new Map([["editing", true]]);
    expect(checkWhen(undefined, conditions)).toBe(true);
    expect(checkWhen(() => false, conditions)).toBe(false);
    expect(checkWhen("editing", conditions)).toBe(true);
    expect(() => checkWhen("missing", conditions)).toThrow();
  });
});

describe("keyMatchesRule", () => {
  it("matches only when the rule's when condition passes", () => {
    const conditions = new Map([["ok", true]]);
    expect(
      keyMatchesRule("x", [makeKeyRule("x", "ok")], conditions),
    ).toBe(true);
    expect(
      keyMatchesRule("x", [makeKeyRule("x", () => false)], conditions),
    ).toBe(false);
    expect(keyMatchesRule("y", [makeKeyRule("x")], conditions)).toBe(false);
  });
});

describe("tryMatchBindings", () => {
  it("fires exact matches and respects mode/when/skip", () => {
    const handler = vi.fn();
    const conditions = new Map<string, boolean>();
    const bindings = [
      makeBinding(["x"], handler, { mode: "insert" }),
      makeBinding(["y"], handler),
    ];
    expect(
      tryMatchBindings(bindings, "insert", ["x"], "x", {}, conditions, () => false),
    ).toBe(true);
    expect(handler).toHaveBeenCalled();
    expect(
      tryMatchBindings(bindings, "normal", ["y"], "y", {}, conditions, () => false),
    ).toBe(true);
  });

  it("falls back to wildcard for normal characters", () => {
    const handler = vi.fn();
    const conditions = new Map<string, boolean>();
    expect(
      tryMatchBindings(
        [makeBinding(["*"], handler)],
        null,
        ["z"],
        "z",
        {},
        conditions,
        () => false,
      ),
    ).toBe(true);
    expect(handler).toHaveBeenCalledWith("z", {});
  });

  it("respects skipBinding, when and wildcard guards", () => {
    const conditions = new Map<string, boolean>();
    const skipped = vi.fn();
    const whenBlocked = vi.fn();
    const wildcard = vi.fn();
    expect(
      tryMatchBindings(
        [makeBinding(["x"], skipped)],
        null,
        ["x"],
        "x",
        {},
        conditions,
        () => false,
        () => true,
      ),
    ).toBe(false);
    expect(skipped).not.toHaveBeenCalled();
    expect(
      tryMatchBindings(
        [makeBinding(["y"], whenBlocked, { when: () => false })],
        null,
        ["y"],
        "y",
        {},
        conditions,
        () => false,
      ),
    ).toBe(false);
    expect(whenBlocked).not.toHaveBeenCalled();
    expect(
      tryMatchBindings(
        [makeBinding(["*"], wildcard, { mode: "insert" })],
        null,
        ["z"],
        "z",
        {},
        conditions,
        () => false,
      ),
    ).toBe(false);
    expect(
      tryMatchBindings(
        [makeBinding(["*"], wildcard, { when: () => false })],
        null,
        ["z"],
        "z",
        {},
        conditions,
        () => false,
      ),
    ).toBe(false);
    expect(wildcard).not.toHaveBeenCalled();
  });

  it("skips wildcard when skipBinding rejects it", () => {
    const handler = vi.fn();
    const conditions = new Map<string, boolean>();
    expect(
      tryMatchBindings(
        [makeBinding(["*"], handler)],
        null,
        ["z"],
        "z",
        {},
        conditions,
        () => false,
        () => true,
      ),
    ).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("handleLayer", () => {
  it("fires a page binding and blocks with stop", () => {
    const handler = vi.fn();
    const layer = makePageLayer({
      bindings: [makePageBinding(["x"], handler)],
    });
    const ctx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handleLayer(ctx, layer, true)).toBe(true);
    expect(handler).toHaveBeenCalled();

    const blocked = vi.fn();
    const stopLayer = makePageLayer({
      bindings: [makePageBinding(["x"], blocked)],
      stoppedKeys: [makeKeyRule("x")],
    });
    const stopCtx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handleLayer(stopCtx, stopLayer, true)).toBe(true);
    expect(blocked).toHaveBeenCalled();
  });

  it("lets penetrated keys fall through", () => {
    const handler = vi.fn();
    const layer = makePageLayer({
      bindings: [makePageBinding(["x"], handler)],
      penetrationKeys: [makeKeyRule("x")],
    });
    const ctx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handleLayer(ctx, layer, true)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("resolves group focus targets and skips missing groups", () => {
    const groupHandler = vi.fn();
    const group = makeFocusTarget({
      bindings: [makePageBinding(["x"], groupHandler)],
    });
    const layer = makePageLayer({
      focusTargets: new Map([
        ["g", { map: new Map([["one", group]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    expect(handleLayer(makeContext({ eventNames: ["x"], input: "x" }), layer, true)).toBe(true);
    expect(groupHandler).toHaveBeenCalled();

    const missing = makePageLayer({
      currentFocusIds: [{ id: "one", fromGroup: "missing" }],
    });
    expect(handleLayer(makeContext({ eventNames: ["x"] }), missing, true)).toBe(false);
  });

  it("gives focus-target wildcard priority", () => {
    const wildcard = vi.fn();
    const target = makeFocusTarget({ bindings: [makeBinding(["*"], wildcard)] });
    const layer = makePageLayer({
      focusTargets: new Map([
        ["g", { map: new Map([["one", target]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    const ctx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handleLayer(ctx, layer, true)).toBe(true);
    expect(wildcard).toHaveBeenCalledWith("z", {});
  });

  it("skips wildcard when mode or when fails", () => {
    const wildcard = vi.fn();
    const fallback = vi.fn();
    const layer = makePageLayer({
      bindings: [
        makePageBinding(["*"], wildcard, { mode: "insert" }),
        makePageBinding(["z"], fallback),
      ],
    });
    const ctx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handleLayer(ctx, layer, true)).toBe(true);
    expect(wildcard).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();
  });

  it("cancels a pending sequence when its condition turns false", () => {
    const handler = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        ["a", [makePageSequenceBinding(["a", "b"], handler, { when: "cond" })]],
      ]),
    });
    const ctx = makeContext({
      eventNames: ["a"],
      input: "a",
      conditions: new Map([["cond", true]]),
    });
    expect(handleLayer(ctx, layer, true)).toBe(true);
    ctx.conditions.set("cond", false);
    expect(handleLayer(ctx, layer, true)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(layer.pendingSequence).toBeNull();
  });

  it("disambiguates shared sequences and fires the chosen handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        ["a", [makePageSequenceBinding(["a", "b"], first), makePageSequenceBinding(["a", "c"], second)]],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"], input: "a" }), layer, true)).toBe(true);
    expect(handleLayer(makeContext({ eventNames: ["c"], input: "c" }), layer, true)).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("keeps a multi-key sequence pending after intermediate keys", () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        ["a", [makePageSequenceBinding(["a", "b", "c"], handler)]],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"], input: "a" }), layer, true)).toBe(true);
    expect(handleLayer(makeContext({ eventNames: ["b"], input: "b" }), layer, true)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(layer.pendingSequence).toBeNull();
    vi.useRealTimers();
  });

  it("consumes mismatched keys for exclusive sequences", () => {
    const handler = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], handler, {
              options: { exclusive: true, stopsWorkingAfterLayerAppearing: false },
            }),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"], input: "a" }), layer, true)).toBe(true);
    expect(handleLayer(makeContext({ eventNames: ["z"], input: "z" }), layer, true)).toBe(true);
    expect(layer.pendingSequence).not.toBeNull();
  });

  it("restarts from a matching candidate after a mismatched key", () => {
    const first = vi.fn();
    const second = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "c", "d"], first),
            makePageSequenceBinding(["a", "b", "e"], second),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"], input: "a" }), layer, true)).toBe(true);
    expect(handleLayer(makeContext({ eventNames: ["b"], input: "b" }), layer, true)).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    expect(layer.pendingSequence?.sequences).toEqual(["a", "b", "e"]);
    expect(handleLayer(makeContext({ eventNames: ["e"], input: "e" }), layer, true)).toBe(true);
    expect(second).toHaveBeenCalled();
  });

  it("cancels a single sequence on mismatch", () => {
    const handler = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        ["a", [makePageSequenceBinding(["a", "b"], handler)]],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"], input: "a" }), layer, true)).toBe(true);
    expect(handleLayer(makeContext({ eventNames: ["z"], input: "z" }), layer, true)).toBe(false);
    expect(layer.pendingSequence).toBeNull();
  });

  it("filters sequence starts by modifiers, mode, overlay, focus and when", () => {
    const handler = vi.fn();
    const bare = makePageLayer({
      sequences: new Map([["d", [makePageSequenceBinding(["d", "v"], handler)]]]),
    });
    const ctrlCtx = makeContext({ eventNames: ["ctrl+d", "d"], input: "d" });
    expect(handleLayer(ctrlCtx, bare, true)).toBe(false);

    const modeLayer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], handler, {
              options: { mode: "insert", stopsWorkingAfterLayerAppearing: false },
            }),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), modeLayer, true)).toBe(false);

    const onlyLayer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], handler, {
              options: { stopsWorkingAfterLayerAppearing: true },
            }),
          ],
        ],
      ]),
    });
    const overlayCtx = makeContext({
      eventNames: ["a"],
      allLayers: [{ layerId: "L", elements: [], activeElements: [] }],
    });
    expect(handleLayer(overlayCtx, onlyLayer, true)).toBe(false);

    const focusLayer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], handler, {
              options: { focusId: "one", stopsWorkingAfterLayerAppearing: false },
            }),
          ],
        ],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), focusLayer, true)).toBe(true);

    const groupFocusLayer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], handler, {
              options: {
                focusId: { group: "g", focusId: "one" },
                stopsWorkingAfterLayerAppearing: false,
              },
            }),
          ],
        ],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), groupFocusLayer, true)).toBe(true);

    const whenLayer = makePageLayer({
      sequences: new Map([
        ["a", [makePageSequenceBinding(["a", "b"], handler, { when: () => false })]],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), whenLayer, true)).toBe(false);
  });

  it("stops keys from the active focus target", () => {
    const target = makeFocusTarget({ stoppedKeys: [makeKeyRule("s")] });
    const layer = makePageLayer({
      defaultTargets: new Map([["one", target]]),
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    expect(handleLayer(makeContext({ eventNames: ["s"] }), layer, true)).toBe(true);
  });

  it("rotates tab focus and returns false without focus order", () => {
    const layer = makePageLayer({
      defaultFocusOrder: ["one", "two"],
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    const notify = vi.fn();
    expect(handleTabNavigation(layer, [], false, notify)).toBe(false);
    expect(handleTabNavigation(layer, ["tab"], false, notify)).toBe(true);
    expect(layer.currentFocusIds[0].id).toBe("two");
    expect(handleTabNavigation(layer, ["tab"], true, notify)).toBe(true);
    expect(layer.currentFocusIds[0].id).toBe("one");
    expect(
      handleTabNavigation(makePageLayer(), ["tab"], false, notify),
    ).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it("skips missing targets inside an existing group", () => {
    const layer = makePageLayer({
      focusTargets: new Map([
        ["g", { map: new Map([["one", makeFocusTarget()]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "missing", fromGroup: "g" }],
    });
    expect(handleLayer(makeContext({ eventNames: ["x"] }), layer, true)).toBe(
      false,
    );
  });

  it("skips focus and screen wildcards when mode or when fails", () => {
    const wildcard = vi.fn();
    const fallback = vi.fn();
    const target = makeFocusTarget({
      bindings: [makeBinding(["*"], wildcard, { mode: "insert" })],
    });
    const layer = makePageLayer({
      focusTargets: new Map([
        ["g", { map: new Map([["one", target]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
      bindings: [makePageBinding(["z"], fallback)],
    });
    const ctx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handleLayer(ctx, layer, true)).toBe(true);
    expect(wildcard).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalled();

    const whenBlocked = vi.fn();
    const screen = makePageLayer({
      bindings: [makePageBinding(["*"], whenBlocked, { when: () => false })],
    });
    const whenCtx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handleLayer(whenCtx, screen, true)).toBe(false);
    expect(whenBlocked).not.toHaveBeenCalled();
  });

  it("narrows expected sequence candidates and cancels on no match", () => {
    const first = vi.fn();
    const second = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b", "c"], first),
            makePageSequenceBinding(["a", "b", "d"], second),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), layer, true)).toBe(
      true,
    );
    expect(handleLayer(makeContext({ eventNames: ["b"] }), layer, true)).toBe(
      true,
    );
    expect(handleLayer(makeContext({ eventNames: ["c"] }), layer, true)).toBe(
      true,
    );
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    const noMatch = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "c", "d"], first),
            makePageSequenceBinding(["a", "b", "e"], second),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), noMatch, true)).toBe(
      true,
    );
    expect(handleLayer(makeContext({ eventNames: ["z"] }), noMatch, true)).toBe(
      false,
    );
    expect(noMatch.pendingSequence).toBeNull();
  });

  it("keeps multiple matching candidates and expires their timer", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "c", "d"], first),
            makePageSequenceBinding(["a", "b", "d"], second),
            makePageSequenceBinding(["a", "b", "e"], third),
          ],
        ],
      ]),
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), layer, true)).toBe(
      true,
    );
    expect(handleLayer(makeContext({ eventNames: ["b"] }), layer, true)).toBe(
      false,
    );
    expect(layer.pendingSequence?.candidates).toHaveLength(2);
    vi.advanceTimersByTime(600);
    expect(layer.pendingSequence).toBeNull();
    vi.useRealTimers();
  });

  it("honours stopsWorkingAfterLayerAppearing for modal layers", () => {
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], () => {}, {
              options: { stopsWorkingAfterLayerAppearing: true },
            }),
          ],
        ],
      ]),
    });
    const modalCtx = makeContext({
      eventNames: ["a"],
      allLayers: [],
      allModalLayers: [{ layerId: "M", elements: [], activeElements: [] }],
    });
    expect(handleLayer(modalCtx, layer, true)).toBe(false);
    expect(handleLayer(makeContext({ eventNames: ["a"] }), layer, true)).toBe(
      true,
    );
  });

  it("filters sequence focusId when the active focus is in another group", () => {
    const layer = makePageLayer({
      sequences: new Map([
        [
          "a",
          [
            makePageSequenceBinding(["a", "b"], () => {}, {
              options: {
                focusId: "one",
                stopsWorkingAfterLayerAppearing: false,
              },
            }),
          ],
        ],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    expect(handleLayer(makeContext({ eventNames: ["a"] }), layer, true)).toBe(
      false,
    );
  });
});

describe("elementParser handlerElement", () => {
  it("fires element bindings and sequences", () => {
    const handler = vi.fn();
    const seqHandler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      bindings: [makeBinding(["x"], handler)],
      sequences: new Map([
        ["a", [makeBinding(["a", "b"], seqHandler)]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handlerElement(ctx, "e1", element, owner, true, ["x"])).toBe(true);
    expect(handler).toHaveBeenCalled();

    const seqCtx = makeContext({ eventNames: ["a"], input: "a" });
    expect(
      handlerElement(seqCtx, "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(owner.pendingSequence.fromElementId).toBe("e1");
  });
});

describe("providers helpers", () => {
  it("pushes and removes key entries", () => {
    const layer = makePageLayer();
    const remove = pushKeyEntries(
      layer,
      "stoppedKeys",
      ["x", "y"],
      (key) => makeKeyRule(key),
    );
    expect(layer.stoppedKeys).toHaveLength(2);
    remove();
    expect(layer.stoppedKeys).toHaveLength(0);
  });

  it("finalizes bindings with action maps and cleanup", () => {
    const layer = makePageLayer();
    const handler = vi.fn();
    const actionMap = new Map<string, string[]>();
    const entry = makeBinding(["x"], handler);
    layer.bindings.push(entry);
    const unbind = finalizeBoundKeyboard(
      layer.bindings,
      actionMap,
      layer,
      entry,
      "save",
      ["x"],
    );
    expect(actionMap.get("save")).toEqual(["x"]);
    unbind();
    expect(layer.bindings).toHaveLength(0);
    expect(actionMap.has("save")).toBe(false);
  });

  it("cleans overrides only when no binding still uses the key", () => {
    const layer = makePageLayer({
      globalKeyOverrides: new Set(["x"]),
      bindings: [makePageBinding(["x"])],
    });
    cleanupGlobalKeyOverrides(layer, ["x"]);
    expect(layer.globalKeyOverrides.has("x")).toBe(true);
    layer.bindings = [];
    cleanupGlobalKeyOverrides(layer, ["x"]);
    expect(layer.globalKeyOverrides.has("x")).toBe(false);
  });

  it("checks focus and default targets while cleaning overrides", () => {
    const layer = makePageLayer({ globalKeyOverrides: new Set(["x"]) });
    layer.focusTargets.set("g", {
      map: new Map([
        ["one", makeFocusTarget({ bindings: [makePageBinding(["x"])] })],
      ]),
      order: ["one"],
    });
    cleanupGlobalKeyOverrides(layer, ["x"]);
    expect(layer.globalKeyOverrides.has("x")).toBe(true);
    layer.focusTargets.clear();
    layer.defaultTargets.set("d", makeFocusTarget({ bindings: [makePageBinding(["x"])] }));
    cleanupGlobalKeyOverrides(layer, ["x"]);
    expect(layer.globalKeyOverrides.has("x")).toBe(true);
    layer.defaultTargets.clear();
    cleanupGlobalKeyOverrides(layer, ["x"]);
    expect(layer.globalKeyOverrides.has("x")).toBe(false);
  });

  it("manages action map entries", () => {
    const map = new Map([["save", ["x", "y"]]]);
    removeKeysFromActionMap(map, "save", ["x"]);
    expect(map.get("save")).toEqual(["y"]);
    removeKeysFromActionMap(map, "save", ["y"]);
    expect(map.has("save")).toBe(false);
  });

  it("setIfAbsent/deleteIfPresent/modifyEntryKeys", () => {
    const map = new Map<string, { keys?: string[] }>();
    expect(setIfAbsent(map, "a", { keys: ["x"] })).toBe(true);
    expect(setIfAbsent(map, "a", {})).toBe(false);
    expect(deleteIfPresent(map, "missing")).toBe(false);
    expect(deleteIfPresent(map, "a")).toBe(true);
    expect(map.has("a")).toBe(false);
    map.set("b", { keys: ["y"] });
    expect(modifyEntryKeys(map, "b", ["z"])?.keys).toEqual(["z"]);
    expect(modifyEntryKeys(map, "missing", [])).toBeUndefined();
    map.set("c", {});
    expect(modifyEntryKeys(map, "c", ["q"])).toBeUndefined();
  });

  it("initializes missing rule arrays and removes absent actions", () => {
    const container = {
      penetrationKeys: [],
      stoppedKeys: [],
    } as Parameters<typeof pushKeyEntries>[0];
    const removeAllowed = pushKeyEntries(
      container,
      "allowedKeys",
      ["a"],
      (key) => makeKeyRule(key),
    );
    expect(container.allowedKeys).toEqual([makeKeyRule("a")]);
    removeAllowed();
    expect(container.allowedKeys).toEqual([]);

    const map = new Map<string, string[]>();
    removeKeysFromActionMap(map, "missing", ["x"]);
    expect(map.size).toBe(0);
  });

  it("initializes missing penetration and stopped arrays", () => {
    const container = {
      allowedKeys: [],
    } as unknown as Parameters<typeof pushKeyEntries>[0];
    const removePenetration = pushKeyEntries(
      container,
      "penetrationKeys",
      ["p"],
      (key) => makeKeyRule(key),
    );
    expect(container.penetrationKeys).toEqual([makeKeyRule("p")]);
    removePenetration();
    expect(container.penetrationKeys).toEqual([]);

    const removeStopped = pushKeyEntries(
      container,
      "stoppedKeys",
      ["s"],
      (key) => makeKeyRule(key),
    );
    expect(container.stoppedKeys).toEqual([makeKeyRule("s")]);
    removeStopped();
    expect(container.stoppedKeys).toEqual([]);
  });

  it("wraps handlers for times, observer and once", () => {
    const layer = makePageLayer();
    const handler = vi.fn();
    const observer = vi.fn();
    const actionMap = new Map<string, string[]>();
    const entry = makeBinding(["x"], handler);
    layer.bindings.push(entry);
    const unbind = finalizeBoundKeyboard(
      layer.bindings,
      actionMap,
      layer,
      entry,
      handler,
      ["x"],
      { times: 2, observer, once: true },
    );
    entry.handler("x", {});
    expect(handler).not.toHaveBeenCalled();
    expect(observer).toHaveBeenCalledWith(1);
    entry.handler("x", {});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(layer.bindings).toHaveLength(0);
    unbind();
  });

  it("unbinds once handlers without times", () => {
    const layer = makePageLayer();
    const handler = vi.fn();
    const actionMap = new Map<string, string[]>();
    const entry = makeBinding(["x"], handler);
    layer.bindings.push(entry);
    finalizeBoundKeyboard(
      layer.bindings,
      actionMap,
      layer,
      entry,
      handler,
      ["x"],
      { once: true },
    );
    entry.handler("x", {});
    expect(handler).toHaveBeenCalled();
    expect(layer.bindings).toHaveLength(0);
  });
});

describe("checkGlobalKey", () => {
  it("filters by category and override", () => {
    const top = {};
    const layer = makePageLayer({ globalKeyOverrides: new Set(["x"]) });
    const layers = new Map([[top, layer]]);
    expect(
      checkGlobalKey(
        { key: "x", operate: () => {}, category: [top] },
        ["x"],
        top,
        layers,
      ),
    ).toBe(false);
    expect(
      checkGlobalKey(
        { key: "y", operate: () => {} },
        ["y"],
        top,
        layers,
      ),
    ).toBe(true);
  });

  it("handles missing top component and category mismatches", () => {
    const top = {};
    const layer = makePageLayer();
    const layers = new Map([[top, layer]]);
    expect(
      checkGlobalKey({ key: "x", operate: () => {} }, ["x"], null, layers),
    ).toBe(false);
    expect(
      checkGlobalKey(
        { key: "x", operate: () => {}, category: [] },
        ["x"],
        top,
        layers,
      ),
    ).toBe(false);
    expect(
      checkGlobalKey(
        { key: "x", operate: () => {}, category: ["other"] },
        ["x"],
        top,
        layers,
      ),
    ).toBe(false);
  });
});

describe("isNormalCharacter", () => {
  it("is true only for real character input", () => {
    expect(isNormalCharacter("a", {}, () => false)).toBe(true);
    expect(isNormalCharacter("", {}, () => false)).toBe(false);
    expect(isNormalCharacter("a", { ctrl: true }, () => true)).toBe(false);
  });
});

