import { describe, expect, it } from "vitest";
import {
	snapSensitivity,
	valueFromBarX,
	valueFromRatio,
	SENSITIVITY_MAX,
	SENSITIVITY_MIN,
	SENSITIVITY_STEP,
} from "../src/view/utils/sensitivity-bar.js";

describe("sensitivity bar mapping", () => {
	it("maps the bar ratio to 0.5-step values in 1..10", () => {
		expect(valueFromRatio(0)).toBe(SENSITIVITY_MIN);
		expect(valueFromRatio(1)).toBe(SENSITIVITY_MAX);
		expect(valueFromRatio(0.5)).toBe(5.5); // round(0.5 * 17) = 9 steps
	});

	it("clamps out-of-range ratios", () => {
		expect(valueFromRatio(-1)).toBe(SENSITIVITY_MIN);
		expect(valueFromRatio(2)).toBe(SENSITIVITY_MAX);
	});

	it("snaps by 0.5 steps within bounds", () => {
		expect(snapSensitivity(3, 1)).toBe(3.5);
		expect(snapSensitivity(3, -1)).toBe(2.5);
		expect(snapSensitivity(SENSITIVITY_MAX, 1)).toBe(SENSITIVITY_MAX);
		expect(snapSensitivity(SENSITIVITY_MIN, -1)).toBe(SENSITIVITY_MIN);
	});
});

describe("slider cell mapping", () => {
	it("maps the last cell to max, not max - step", () => {
		// The bar renders exactly `steps` cells; the final cell (index
		// steps - 1) is the right edge and must select the maximum.
		expect(
			valueFromBarX(17, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP),
		).toBe(SENSITIVITY_MAX); // 18 cells span 1..10
		expect(valueFromBarX(19, 0, 2000, 100)).toBe(2000); // 20 cells span 0..2000
		expect(valueFromBarX(0, 0, 2000, 100)).toBe(0);
	});

	it("clamps clicks past the last cell to max", () => {
		expect(valueFromBarX(999, 0, 2000, 100)).toBe(2000);
	});

	it("collapses a single-value range to min", () => {
		// stepsFor(5, 5, 1) === 0, so the ratio divisor would be negative.
		expect(valueFromBarX(3, 5, 5, 1)).toBe(5);
	});
});
