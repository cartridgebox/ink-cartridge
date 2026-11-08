import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Page = {};

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function isWaiting(engine: ReturnType<typeof createEngine>): boolean {
	return engine.currentScreenHasSequenceWaiting(() => {});
}

function pageSetup() {
	const engine = createEngine();
	engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });

	let runs = 0;
	engine.boundKeyboard(["z"], () => {}, { focusId: "A" });
	engine.boundKeyboard(["y"], () => {}, { focusId: "B" });
	engine.focusSet("A");
	engine.boundSequence(["a", "b"], () => runs++, { focusId: "A" });

	return { engine, runs: () => runs };
}

describe("focus changes cancel a focus-scoped pending sequence", () => {
	test("focusSet to the current target keeps it", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		expect(engine.focusSet("A")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});

	test("focusSet to another target clears it", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});

		expect(engine.focusSet("B")).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("focusNext in a single-target group keeps it", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["x"], () => {}, {
			focusId: { group: "one", focusId: "only" },
		});
		engine.processKey("a", {});

		expect(engine.focusNext("one")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});

	test("focusNext with two targets clears it", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});

		expect(engine.focusNext()).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("kickFocusGroup clears it for a named group", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		engine.processKey("a", {});

		expect(engine.kickFocusGroup("nav")).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("focusNext in a named group with two targets clears it", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		engine.processKey("a", {});

		expect(engine.focusNext("nav")).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("focusPrev with two targets clears it", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});

		expect(engine.focusPrev()).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("kickFocusGroup clears it when the focus is removed", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});

		expect(engine.kickFocusGroup()).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("focusUnregister clears it only when the focused target is removed", () => {
		const focused = pageSetup();
		focused.engine.processKey("a", {});
		expect(focused.engine.focusUnregister("A")).toBe(true);
		expect(isWaiting(focused.engine)).toBe(false);
		focused.engine.processKey("b", {});
		expect(focused.runs()).toBe(0);

		const unfocused = pageSetup();
		unfocused.engine.processKey("a", {});
		expect(unfocused.engine.focusUnregister("B")).toBe(true);
		expect(isWaiting(unfocused.engine)).toBe(true);
		unfocused.engine.processKey("b", {});
		expect(unfocused.runs()).toBe(1);
		unfocused.engine.abortComposition();
	});

	test("activateFocusGroup clears it when the group gains its first focus", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		engine.kickFocusGroup("nav");
		engine.processKey("a", {});

		expect(engine.activateFocusGroup("N1", "nav")).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
	});

	test("activateFocusGroup clears it when the default group gains its first focus", () => {
		const engine = createEngine();
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundKeyboard(["z"], () => {}, { focusId: "A" });
		engine.kickFocusGroup(); // A remains registered, but no focus is active
		engine.boundSequence(["a", "b"], () => runs++);
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		expect(engine.activateFocusGroup("A")).toBe(true);
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});
});

describe("Tab rotation cancels a focus-scoped pending sequence", () => {
	test("page-level autoTab clears it", () => {
		const engine = createEngine({ autoTab: true });
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundKeyboard(["z"], () => {}, { focusId: "A" });
		engine.boundKeyboard(["y"], () => {}, { focusId: "B" });
		engine.focusSet("A");
		engine.boundSequence(["a", "b"], () => runs++, { focusId: "A" });

		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("tab", {});
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});

	test("element-level autoTab clears the element's own pending", () => {
		const engine = createEngine({ autoTab: true });
		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", ["e"])],
			modalLayers: [],
		});
		let runs = 0;
		engine.pushOwner("L");
		engine.boundKeyboard(["z"], () => {}, {
			elementId: "e",
			focusId: "A",
		});
		engine.boundKeyboard(["y"], () => {}, {
			elementId: "e",
			focusId: "B",
		});
		engine.boundSequence(["a", "b"], () => runs++, {
			elementId: "e",
			focusId: "A",
		});
		engine.popOwner("L");

		engine.pushOwner("L");
		engine.focusSet("A", { element: "e" });
		engine.popOwner("L");

		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("tab", {});
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});

	test("element-level autoTab clears only that element's pending", () => {
		const engine = createEngine({ autoTab: true });
		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", ["a", "b"])],
			modalLayers: [],
		});
		let runs = 0;
		engine.pushOwner("L");
		engine.boundKeyboard(["z"], () => {}, {
			elementId: "a",
			focusId: "A1",
		});
		engine.boundKeyboard(["y"], () => {}, {
			elementId: "a",
			focusId: "A2",
		});
		// Exclusive so the Tab key is consumed by b's own pending sequence
		// instead of breaking it; the assertion then isolates a's Tab clearing.
		engine.boundSequence(["q", "w"], () => runs++, {
			elementId: "b",
			exclusive: true,
		});
		engine.popOwner("L");

		engine.pushOwner("L");
		engine.focusSet("A1", { element: "a" });
		engine.popOwner("L");

		engine.processKey("q", {});
		expect(isWaiting(engine)).toBe(true);

		// a's autoTab rotates A1 -> A2; b's pending sequence must survive.
		engine.processKey("tab", {});
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("w", {});
		expect(runs).toBe(1);
		engine.abortComposition();
	});
});

describe("continuation re-checks the starting environment", () => {
	test("a pending sequence does not survive a focus change even if clearing was skipped", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		// Simulate a focus path that forgot to clear (the second line of defence).
		vi.spyOn(engine["layers"], "clearPendingSequence").mockImplementation(
			() => {},
		);
		expect(engine.focusSet("B")).toBe(true);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(0);
		expect(isWaiting(engine)).toBe(false);
	});

	test("element continuation re-checks focus even if clearing was skipped", () => {
		const engine = createEngine();
		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", ["e"])],
			modalLayers: [],
		});
		let runs = 0;
		engine.pushOwner("L");
		engine.boundKeyboard(["z"], () => {}, {
			elementId: "e",
			focusId: "A",
		});
		engine.boundKeyboard(["y"], () => {}, {
			elementId: "e",
			focusId: "B",
		});
		engine.boundSequence(["a", "b"], () => runs++, {
			elementId: "e",
			focusId: "A",
		});
		engine.popOwner("L");

		engine.pushOwner("L");
		engine.focusSet("A", { element: "e" });
		engine.popOwner("L");

		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		vi.spyOn(engine["layers"], "clearPendingSequence").mockImplementation(
			() => {},
		);
		engine.pushOwner("L");
		expect(engine.focusSet("B", { element: "e" })).toBe(true);
		engine.popOwner("L");
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs).toBe(0);
		expect(isWaiting(engine)).toBe(false);
	});

	test("a pending sequence does not continue after a layer appears", () => {
		const engine = createEngine();
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundSequence(["a", "b"], () => runs++, {
			stopsWorkingAfterLayerAppearing: true,
		});

		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", [])],
			modalLayers: [],
		});
		engine.processKey("b", {});

		expect(runs).toBe(0);
		expect(isWaiting(engine)).toBe(false);
	});
});

describe("no-op focus calls keep a pending sequence", () => {
	test("focusSet / focusNext / focusPrev with unknown targets keep it", () => {
		const { engine, runs } = pageSetup();
		engine.processKey("a", {});

		expect(engine.focusSet("missing")).toBe(false);
		expect(engine.focusSet("missing", "unknown-group")).toBe(false);
		expect(engine.focusNext("unknown-group")).toBe(false);
		expect(engine.focusPrev("unknown-group")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});

	test("activateFocusGroup on a group that already has focus keeps it", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		engine.processKey("a", {});

		expect(engine.activateFocusGroup("N2", "nav")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});

	test("kickFocusGroup on a group with no active focus keeps it", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.kickFocusGroup("nav");
		engine.processKey("a", {});

		expect(engine.kickFocusGroup("nav")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});

	test("focusNext / focusPrev on a group with no active focus keep it", () => {
		const { engine, runs } = pageSetup();
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		engine.kickFocusGroup("nav");
		engine.processKey("a", {});

		expect(engine.focusNext("nav")).toBe(false);
		expect(engine.focusPrev("nav")).toBe(false);
		expect(isWaiting(engine)).toBe(true);

		engine.processKey("b", {});
		expect(runs()).toBe(1);
		engine.abortComposition();
	});
});

describe("auto-activation cancels a pending sequence", () => {
	test("a new default-group target claims focus and clears it", () => {
		const engine = createEngine();
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundSequence(["a", "b"], () => runs++);
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.boundKeyboard(["z"], () => {}, { focusId: "A" });
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});

	test("a new named-group target claims focus and clears it", () => {
		const engine = createEngine();
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundSequence(["a", "b"], () => runs++);
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.boundKeyboard(["z"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});

	test("a new target in an existing group claims focus and clears it", () => {
		const engine = createEngine();
		engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
		let runs = 0;
		engine.boundKeyboard(["n1"], () => {}, {
			focusId: { group: "nav", focusId: "N1" },
		});
		engine.kickFocusGroup("nav");
		engine.boundSequence(["a", "b"], () => runs++);
		engine.processKey("a", {});
		expect(isWaiting(engine)).toBe(true);

		engine.boundKeyboard(["n2"], () => {}, {
			focusId: { group: "nav", focusId: "N2" },
		});
		expect(isWaiting(engine)).toBe(false);

		engine.processKey("b", {});
		expect(runs).toBe(0);
	});
});
