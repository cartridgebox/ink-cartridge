import { afterEach, describe, expect, test, vi } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Page = {};

afterEach(() => {
	vi.useRealTimers();
});

function setupPage(options: { focusId?: string; stops?: boolean }) {
	const engine = createEngine();
	engine.sync({ pagePath: [Page], layers: [], modalLayers: [] });
	engine.addCondition("gate", false);

	let plain = 0;
	let sequence = 0;

	// Create and activate the focus target.
	if (options.focusId) {
		engine.boundKeyboard(["z"], () => {}, { focusId: options.focusId });
	}
	engine.boundKeyboard(["a"], () => {
		plain++;
	});
	engine.boundSequence(
		["a", "b"],
		() => {
			sequence++;
		},
		{
			...(options.focusId ? { focusId: options.focusId } : {}),
			...(options.stops ? { stopsWorkingAfterLayerAppearing: true } : {}),
			when: "gate",
		},
	);

	return { engine, counts: () => ({ plain, sequence }) };
}

describe("sequence candidate filtering combines when with its other gates", () => {
	test("focusId: when=false excludes the sequence", () => {
		const { engine, counts } = setupPage({ focusId: "target" });

		engine.processKey("a", {});

		expect(counts().plain).toBe(1);
		expect(counts().sequence).toBe(0);
		engine.abortComposition();
	});

	test("focusId: when=true still starts the sequence", () => {
		const { engine, counts } = setupPage({ focusId: "target" });
		engine.setCondition("gate", true);

		engine.processKey("a", {});

		expect(counts().plain).toBe(0);
		expect(engine.currentScreenHasSequenceWaiting(() => {})).toBe(true);
		engine.abortComposition();
	});

	test("stopsWorkingAfterLayerAppearing: when=false excludes the sequence", () => {
		const { engine, counts } = setupPage({ stops: true });

		engine.processKey("a", {});

		expect(counts().plain).toBe(1);
		expect(counts().sequence).toBe(0);
		engine.abortComposition();
	});

	test("focusId inside a layer element: when=false excludes the sequence", () => {
		const engine = createEngine();
		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", ["e"])],
			modalLayers: [],
		});
		engine.addCondition("gate", false);

		let plain = 0;
		engine.pushOwner("L");
		engine.boundKeyboard(["z"], () => {}, {
			elementId: "e",
			focusId: "target",
		});
		engine.boundKeyboard(
			["a"],
			() => {
				plain++;
			},
			{ elementId: "e" },
		);
		engine.boundSequence(["a", "b"], () => {}, {
			elementId: "e",
			focusId: "target",
			when: "gate",
		});
		engine.popOwner("L");

		engine.processKey("a", {});

		expect(plain).toBe(1);
		engine.abortComposition();
	});
});
