import { describe, expect, test } from "vitest";
import { MouseReportFilter } from "../../../src/keyboard/mouse-report-filter.js";

describe("MouseReportFilter", () => {
	test("swallows a complete SGR mouse report", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<0;20;5M")).toBe(true);
	});

	test("swallows a release report ending in lowercase m", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<0;20;5m")).toBe(true);
	});

	test("swallows a wheel report", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<64;20;5M")).toBe(true);
	});

	test("swallows a report split across stdin chunks", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<0;20")).toBe(true); // first chunk, no terminator yet
		expect(filter.consume(";5M")).toBe(true); // rest completes the report
		expect(filter.consume("a")).toBe(false); // filter reset, normal input passes
	});

	test("lets normal keyboard input through", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("a")).toBe(false);
		expect(filter.consume("")).toBe(false);
		expect(filter.consume("[")).toBe(false); // a lone [ typed by the user
	});

	test("releases input that can no longer be part of a report", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<0;20;5")).toBe(true); // a plausible report prefix
		// "x..." cannot continue a report — it must pass through, not be eaten.
		expect(filter.consume("x".repeat(40))).toBe(false);
		expect(filter.consume("a")).toBe(false); // and the filter is reset
	});

	test("releases normal keys after a pasted [< fragment", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<3")).toBe(true); // looks like a report start
		expect(filter.consume("a")).toBe(false); // not a continuation → passes
		expect(filter.consume("b")).toBe(false); // filter state is reset
	});

	test("keeps buffering chunks that can still extend a report", () => {
		const filter = new MouseReportFilter();
		expect(filter.consume("[<0")).toBe(true);
		expect(filter.consume(";20")).toBe(true);
		expect(filter.consume(";5m")).toBe(true); // completes the release report
		expect(filter.consume("a")).toBe(false);
	});
});
