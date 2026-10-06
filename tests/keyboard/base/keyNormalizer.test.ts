import { describe, expect, test } from "vitest";
import {
  isInkSpecialKey,
  normalizeKeyNames,
} from "../../../src/keyboard/keyNormalizer.js";

describe("normalizeKeyNames", () => {
  test("maps a bare character input with no modifier to the bare key name", () => {
    expect(normalizeKeyNames("s", {})).toEqual(["s"]);
  });

  test("maps a ctrl-modified character input to ctrl+name only", () => {
    expect(normalizeKeyNames("s", { ctrl: true })).toEqual(["ctrl+s"]);
  });

  test("maps a shift-modified character input to shift+name", () => {
    expect(normalizeKeyNames("s", { shift: true })).toEqual(["shift+s"]);
  });

  test("maps a meta-modified character input to meta+name", () => {
    expect(normalizeKeyNames("s", { meta: true })).toEqual(["meta+s"]);
  });

  test("excludes the bare name when a modifier is held with a character input", () => {
    expect(normalizeKeyNames("s", { ctrl: true, shift: true })).toEqual([
      "ctrl+s",
      "shift+s",
      "ctrl+shift+s",
    ]);
  });

  test("maps an unmodified special key to its bare key name", () => {
    expect(normalizeKeyNames("", { escape: true })).toEqual(["escape"]);
    expect(normalizeKeyNames("", { tab: true })).toEqual(["tab"]);
    expect(normalizeKeyNames("", { upArrow: true })).toEqual(["up"]);
    expect(normalizeKeyNames("", { backspace: true })).toEqual(["backspace"]);
    expect(normalizeKeyNames("", { pageUp: true })).toEqual(["pageup"]);
    expect(normalizeKeyNames("", { delete: true })).toEqual(["delete"]);
  });

  test("maps a shift-modified special key to shift+name and excludes the bare name", () => {
    expect(normalizeKeyNames("", { return: true, shift: true })).toEqual([
      "shift+return",
    ]);
    expect(normalizeKeyNames("", { tab: true, shift: true })).toEqual([
      "shift+tab",
    ]);
  });

  test("maps a meta-modified special key to meta+name", () => {
    expect(normalizeKeyNames("", { tab: true, meta: true })).toEqual([
      "meta+tab",
    ]);
  });

  test("combines multiple modifiers on a special key in ctrl, shift, ctrl+shift order", () => {
    expect(
      normalizeKeyNames("", { return: true, ctrl: true, shift: true }),
    ).toEqual(["ctrl+return", "shift+return", "ctrl+shift+return"]);
  });

  test("maps arrow directions through the special map", () => {
    expect(normalizeKeyNames("", { upArrow: true })).toEqual(["up"]);
    expect(normalizeKeyNames("", { leftArrow: true })).toEqual(["left"]);
    expect(normalizeKeyNames("", { ctrl: true, downArrow: true })).toEqual([
      "ctrl+down",
    ]);
  });

  test("stops at the first matching special key in map order, ignoring later flags", () => {
    // upArrow precedes tab in the special map, so the tab flag is ignored.
    expect(normalizeKeyNames("", { upArrow: true, tab: true })).toEqual(["up"]);
  });

  test("returns an empty list for an empty input with no special key", () => {
    expect(normalizeKeyNames("", {})).toEqual([]);
  });

  test("ignores a release event (no name can be normalized)", () => {
    expect(normalizeKeyNames("", { eventType: "release" })).toEqual([]);
  });
});

describe("isInkSpecialKey", () => {
  test("returns true for arrow keys", () => {
    expect(isInkSpecialKey({ upArrow: true })).toBe(true);
    expect(isInkSpecialKey({ downArrow: true })).toBe(true);
    expect(isInkSpecialKey({ leftArrow: true })).toBe(true);
    expect(isInkSpecialKey({ rightArrow: true })).toBe(true);
  });

  test("returns true for navigation keys", () => {
    expect(isInkSpecialKey({ pageUp: true })).toBe(true);
    expect(isInkSpecialKey({ home: true })).toBe(true);
    expect(isInkSpecialKey({ end: true })).toBe(true);
  });

  test("returns true for control keys", () => {
    expect(isInkSpecialKey({ return: true })).toBe(true);
    expect(isInkSpecialKey({ escape: true })).toBe(true);
    expect(isInkSpecialKey({ tab: true })).toBe(true);
    expect(isInkSpecialKey({ backspace: true })).toBe(true);
    expect(isInkSpecialKey({ delete: true })).toBe(true);
  });

  test("returns true when a modifier is held", () => {
    expect(isInkSpecialKey({ ctrl: true })).toBe(true);
    expect(isInkSpecialKey({ meta: true })).toBe(true);
    expect(isInkSpecialKey({ super: true })).toBe(true);
    expect(isInkSpecialKey({ hyper: true })).toBe(true);
  });

  test("returns true for a release event", () => {
    expect(isInkSpecialKey({ eventType: "release" })).toBe(true);
  });

  test("returns false for a normal character key", () => {
    expect(isInkSpecialKey({})).toBe(false);
    expect(isInkSpecialKey({ ctrl: false, shift: false })).toBe(false);
  });

  test("treats undefined and null descriptors as a normal character", () => {
    expect(isInkSpecialKey(undefined)).toBe(false);
    expect(isInkSpecialKey(null)).toBe(false);
  });

  test("normalizeKeyNames treats undefined and null descriptors as no flags", () => {
    expect(normalizeKeyNames("a", undefined)).toEqual(["a"]);
    expect(normalizeKeyNames("a", null)).toEqual(["a"]);
    expect(normalizeKeyNames("", undefined)).toEqual([]);
  });
});
