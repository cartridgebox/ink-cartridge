import { describe, expect, it } from "vitest";
import {
  activateElement,
  activateElementInModalLayer,
  deactivateElement,
  deactivateElementInModalLayer,
} from "../../../src/index.js";

describe("root barrel exports", () => {
  it("exports the element activation functions", () => {
    // Their `*Fn` types were exported while the functions themselves were
    // missing from the barrel, so importing them yielded undefined.
    expect(typeof activateElement).toBe("function");
    expect(typeof deactivateElement).toBe("function");
    expect(typeof activateElementInModalLayer).toBe("function");
    expect(typeof deactivateElementInModalLayer).toBe("function");
  });
});
