import { describe, expect, it } from "vitest";
import {
	filledCells,
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
		// The bar renders `steps + 1` cells — one per value; the final cell
		// (index steps) is the right edge and must select the maximum.
		expect(
			valueFromBarX(18, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP),
		).toBe(SENSITIVITY_MAX); // 19 cells span 1..10
		expect(valueFromBarX(20, 0, 2000, 100)).toBe(2000); // 21 cells span 0..2000
		expect(valueFromBarX(0, 0, 2000, 100)).toBe(0);
	});

	it("reaches every value, including the interior ones", () => {
		// With `steps` cells and a `/ (steps - 1)` ratio, one interior value had
		// no cell (clicking the middle gave 1100 ms, never 1000 ms). One cell per
		// value closes that gap: all 21 values are mouse-reachable.
		const reached = new Set<number>();
		for (let x = 0; x <= 20; x += 1) {
			reached.add(valueFromBarX(x, 0, 2000, 100));
		}
		expect(reached.size).toBe(21);
		expect(reached.has(1000)).toBe(true);
	});

	it("clamps clicks past the last cell to max", () => {
		expect(valueFromBarX(999, 0, 2000, 100)).toBe(2000);
	});

	it("collapses a single-value range to min", () => {
		// stepsFor(5, 5, 1) === 0, so the ratio divisor would be zero.
		expect(valueFromBarX(3, 5, 5, 1)).toBe(5);
	});
});

describe("slider fill mapping", () => {
	it("fills one cell per value, aligned with the click mapping", () => {
		// 18 steps → 19 cells. 5.0× is cell 8, so 9 cells fill; 5.5× is cell 9,
		// so 10 fill. A proportional fill would round to 8 and 10, skipping 9 —
		// the fill must follow the cell index the click mapping uses.
		expect(filledCells(5, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP)).toBe(9);
		expect(filledCells(5.5, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP)).toBe(10);
	});

	it("lights one cell at min and the whole bar at max", () => {
		expect(filledCells(0, 0, 2000, 100)).toBe(1); // cell 0 lit
		expect(filledCells(2000, 0, 2000, 100)).toBe(21); // all 21 cells
	});

	it("clamps out-of-range values to the bar", () => {
		expect(filledCells(-100, 0, 2000, 100)).toBe(1);
		expect(filledCells(9999, 0, 2000, 100)).toBe(21);
	});
});
