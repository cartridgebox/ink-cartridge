import { describe, expect, it, vi } from "vitest";
import {
  collectElementFocusTargets,
  handlerElement,
  handleTabNavigation,
} from "../../../src/elementParser.js";
import { defaultTargetsSymbol } from "../../../src/types/default-targets-symbol.js";
import {
  makeBinding,
  makeContext,
  makeElementKeyboard,
  makeFocusTarget,
  makeKeyRule,
  makeLayerKeyboard,
  makeSequenceBinding,
} from "../../_helpers/factories.js";

describe("elementParser tab navigation", () => {
  it("cycles default focus forward and backward", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultFocusOrder: ["one", "two"],
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    const ctx = makeContext({ eventNames: ["tab"] });
    expect(handleTabNavigation(element, ctx, false)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("two");
    expect(handleTabNavigation(element, ctx, true)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("one");
    expect(handleTabNavigation(element, ctx, true)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("two");
  });

  it("returns false when there is no focus order", () => {
    const element = makeElementKeyboard("e1", "L");
    const ctx = makeContext({ eventNames: ["tab"] });
    expect(handleTabNavigation(element, ctx, false)).toBe(false);
  });

  it("rotates backward on a shift+tab-only event", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultFocusOrder: ["one", "two", "three"],
      currentFocusIds: [{ id: "two", fromGroup: defaultTargetsSymbol }],
    });
    const ctx = makeContext({ eventNames: ["shift+tab"] });
    expect(handleTabNavigation(element, ctx, true)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("one");
  });

  it("matches the autoTabKey from the context", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultFocusOrder: ["one", "two", "three"],
      currentFocusIds: [{ id: "two", fromGroup: defaultTargetsSymbol }],
    });
    const ctx = makeContext({ eventNames: ["Tab"], autoTabKey: "Tab" });
    expect(handleTabNavigation(element, ctx, false)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("three");
  });
});

describe("elementParser handlerElement", () => {
  it("collects active focus targets", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultTargets: new Map([["one", makeFocusTarget()]]),
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    expect(collectElementFocusTargets(element)).toHaveLength(1);
  });

  it("collects active group focus targets", () => {
    const element = makeElementKeyboard("e1", "L", {
      focusTargets: new Map([
        ["g", { map: new Map([["one", makeFocusTarget()]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    expect(collectElementFocusTargets(element)).toHaveLength(1);
  });

  it("handles autoTab inside an element", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultFocusOrder: ["one", "two"],
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({ eventNames: ["tab"], autoTab: true });
    expect(handlerElement(ctx, "e1", element, owner, true, ["tab"])).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("two");
  });

  it("starts focus from the first default target", () => {
    const element = makeElementKeyboard("e1", "L", {
      defaultFocusOrder: ["one", "two"],
    });
    const ctx = makeContext({ eventNames: ["tab"] });
    expect(handleTabNavigation(element, ctx, false)).toBe(true);
    expect(element.currentFocusIds[0].id).toBe("one");
  });

  it("fires element bindings and wildcard priority", () => {
    const handler = vi.fn();
    const wildcard = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      bindings: [makeBinding(["x"], handler), makeBinding(["*"], wildcard)],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handlerElement(ctx, "e1", element, owner, true, ["x"])).toBe(true);
    expect(handler).toHaveBeenCalled();

    const wildCtx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(
      handlerElement(wildCtx, "e1", element, owner, true, ["z"]),
    ).toBe(true);
    expect(wildcard).toHaveBeenCalled();
  });

  it("checks focus-target bindings and stopped keys", () => {
    const focusHandler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      defaultTargets: new Map([
        [
          "f1",
          makeFocusTarget({
            bindings: [makeBinding(["x"], focusHandler)],
            stoppedKeys: [makeKeyRule("s")],
          }),
        ],
      ]),
      currentFocusIds: [{ id: "f1", fromGroup: defaultTargetsSymbol }],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({ eventNames: ["x"], input: "x" });
    expect(handlerElement(ctx, "e1", element, owner, true, ["x"])).toBe(true);
    expect(focusHandler).toHaveBeenCalled();

    const stopCtx = makeContext({ eventNames: ["s"], input: "s" });
    expect(
      handlerElement(stopCtx, "e1", element, owner, true, ["s"]),
    ).toBe(true);
  });

  it("gives focus-target wildcard priority", () => {
    const wildcard = vi.fn();
    const target = makeFocusTarget({ bindings: [makeBinding(["*"], wildcard)] });
    const element = makeElementKeyboard("e1", "L", {
      focusTargets: new Map([
        ["g", { map: new Map([["one", target]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handlerElement(ctx, "e1", element, owner, true, ["z"])).toBe(true);
    expect(wildcard).toHaveBeenCalledWith("z", {});
  });

  it("skips focus wildcard when mode mismatches", () => {
    const wildcard = vi.fn();
    const target = makeFocusTarget({
      bindings: [makeBinding(["*"], wildcard, { mode: "insert" })],
    });
    const element = makeElementKeyboard("e1", "L", {
      focusTargets: new Map([
        ["g", { map: new Map([["one", target]]), order: ["one"] }],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({
      eventNames: ["z"],
      input: "z",
      wildcardFirst: true,
    });
    expect(handlerElement(ctx, "e1", element, owner, true, ["z"])).toBe(false);
    expect(wildcard).not.toHaveBeenCalled();
  });

  it("starts and completes a pending sequence", () => {
    const seqHandler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b"], seqHandler)]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const startCtx = makeContext({ eventNames: ["a"], input: "a" });
    expect(
      handlerElement(startCtx, "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(owner.pendingSequence.fromElementId).toBe("e1");

    const nextCtx = makeContext({ eventNames: ["b"], input: "b" });
    expect(
      handlerElement(nextCtx, "e1", element, owner, true, ["b"]),
    ).toBe("sequence");
    expect(seqHandler).toHaveBeenCalled();
    expect(owner.pendingSequence.fromElementId).toBeNull();
  });

  it("keeps an exclusive pending sequence on mismatch", () => {
    const seqHandler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        [
          "a",
          [makeSequenceBinding(["a", "b"], seqHandler, { options: { exclusive: true } })],
        ],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    handlerElement(makeContext({ eventNames: ["a"], input: "a" }), "e1", element, owner, true, ["a"]);
    expect(
      handlerElement(makeContext({ eventNames: ["z"], input: "z" }), "e1", element, owner, true, ["z"]),
    ).toBe("sequence");
    expect(owner.pendingSequence.fromElementId).toBe("e1");
  });

  it("cancels a non-exclusive pending sequence on mismatch", () => {
    const seqHandler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b"], seqHandler)]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    handlerElement(makeContext({ eventNames: ["a"], input: "a" }), "e1", element, owner, true, ["a"]);
    expect(
      handlerElement(makeContext({ eventNames: ["z"], input: "z" }), "e1", element, owner, true, ["z"]),
    ).toBe(false);
    expect(owner.pendingSequence.fromElementId).toBeNull();
  });

  it("disambiguates multiple sequence candidates", () => {
    const first = vi.fn();
    const second = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b"], first), makeSequenceBinding(["a", "c"], second)]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    handlerElement(makeContext({ eventNames: ["a"], input: "a" }), "e1", element, owner, true, ["a"]);
    expect(
      handlerElement(makeContext({ eventNames: ["c"], input: "c" }), "e1", element, owner, true, ["c"]),
    ).toBe("sequence");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  it("cancels a pending sequence when its condition turns false", () => {
    const handler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b"], handler, { when: "cond" })]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    const ctx = makeContext({
      eventNames: ["a"],
      input: "a",
      conditions: new Map([["cond", true]]),
    });
    expect(handlerElement(ctx, "e1", element, owner, true, ["a"])).toBe(
      "sequence",
    );
    ctx.conditions.set("cond", false);
    expect(handlerElement(ctx, "e1", element, owner, true, ["b"])).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(owner.pendingSequence.fromElementId).toBeNull();
  });

  it("narrows expected candidates while a sequence is pending", () => {
    const first = vi.fn();
    const second = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        [
          "a",
          [
            makeSequenceBinding(["a", "b", "c"], first),
            makeSequenceBinding(["a", "b", "d"], second),
          ],
        ],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["b"] }), "e1", element, owner, true, ["b"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["c"] }), "e1", element, owner, true, ["c"]),
    ).toBe("sequence");
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it("expires a pending sequence timer", () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b", "c"], handler)]],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["b"] }), "e1", element, owner, true, ["b"]),
    ).toBe("sequence");
    vi.advanceTimersByTime(600);
    expect(owner.pendingSequence.fromElementId).toBeNull();
    vi.useRealTimers();
  });

  it("restarts from a matching candidate after a mismatched key", () => {
    const first = vi.fn();
    const second = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        [
          "a",
          [
            makeSequenceBinding(["a", "c", "d"], first),
            makeSequenceBinding(["a", "b", "e"], second),
          ],
        ],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["b"] }), "e1", element, owner, true, ["b"]),
    ).toBe("sequence");
    expect(owner.pendingSequence.pendingSequence?.sequences).toEqual([
      "a",
      "b",
      "e",
    ]);
    expect(
      handlerElement(makeContext({ eventNames: ["e"] }), "e1", element, owner, true, ["e"]),
    ).toBe("sequence");
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it("cancels element candidate sequences on no match", () => {
    const first = vi.fn();
    const second = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        [
          "a",
          [
            makeSequenceBinding(["a", "c", "d"], first),
            makeSequenceBinding(["a", "b", "e"], second),
          ],
        ],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["z"] }), "e1", element, owner, true, ["z"]),
    ).toBe(false);
    expect(owner.pendingSequence.fromElementId).toBeNull();
  });

  it("keeps multiple element candidates and expires their timer", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const element = makeElementKeyboard("e1", "L", {
      sequences: new Map([
        [
          "a",
          [
            makeSequenceBinding(["a", "c", "d"], first),
            makeSequenceBinding(["a", "b", "d"], second),
            makeSequenceBinding(["a", "b", "e"], third),
          ],
        ],
      ]),
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e1", element, owner, true, ["a"]),
    ).toBe("sequence");
    expect(
      handlerElement(makeContext({ eventNames: ["b"] }), "e1", element, owner, true, ["b"]),
    ).toBe("sequence");
    expect(owner.pendingSequence.pendingSequence?.candidates).toHaveLength(2);
    vi.advanceTimersByTime(600);
    expect(owner.pendingSequence.fromElementId).toBeNull();
    vi.useRealTimers();
  });

  it("filters sequence starts by modifiers, mode, focus and when", () => {
    const handler = vi.fn();

    const bare = makeElementKeyboard("e1", "L", {
      sequences: new Map([["d", [makeSequenceBinding(["d", "v"], handler)]]]),
    });
    const bareOwner = makeLayerKeyboard("L", { e1: bare });
    expect(
      handlerElement(
        makeContext({ eventNames: ["ctrl+d", "d"], input: "d" }),
        "e1",
        bare,
        bareOwner,
        true,
        ["d"],
      ),
    ).toBe(false);

    const mode = makeElementKeyboard("e2", "L", {
      sequences: new Map([
        [
          "a",
          [makeSequenceBinding(["a", "b"], handler, { options: { mode: "insert" } })],
        ],
      ]),
    });
    const modeOwner = makeLayerKeyboard("L", { e2: mode });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e2", mode, modeOwner, true, ["a"]),
    ).toBe(false);

    const focus = makeElementKeyboard("e3", "L", {
      sequences: new Map([
        [
          "a",
          [makeSequenceBinding(["a", "b"], handler, { options: { focusId: "one" } })],
        ],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: defaultTargetsSymbol }],
    });
    const focusOwner = makeLayerKeyboard("L", { e3: focus });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e3", focus, focusOwner, true, ["a"]),
    ).toBe("sequence");

    const groupFocus = makeElementKeyboard("e4", "L", {
      sequences: new Map([
        [
          "a",
          [
            makeSequenceBinding(["a", "b"], handler, {
              options: { focusId: { group: "g", focusId: "one" } },
            }),
          ],
        ],
      ]),
      currentFocusIds: [{ id: "one", fromGroup: "g" }],
    });
    const groupOwner = makeLayerKeyboard("L", { e4: groupFocus });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e4", groupFocus, groupOwner, true, ["a"]),
    ).toBe("sequence");

    const whenBlocked = makeElementKeyboard("e5", "L", {
      sequences: new Map([
        ["a", [makeSequenceBinding(["a", "b"], handler, { when: () => false })]],
      ]),
    });
    const whenOwner = makeLayerKeyboard("L", { e5: whenBlocked });
    expect(
      handlerElement(makeContext({ eventNames: ["a"] }), "e5", whenBlocked, whenOwner, true, ["a"]),
    ).toBe(false);
  });

  it("stops keys at the element level", () => {
    const element = makeElementKeyboard("e1", "L", {
      stoppedKeys: [makeKeyRule("s")],
    });
    const owner = makeLayerKeyboard("L", { e1: element });
    expect(
      handlerElement(makeContext({ eventNames: ["s"] }), "e1", element, owner, true, ["s"]),
    ).toBe(true);
  });
});
