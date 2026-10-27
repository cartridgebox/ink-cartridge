import { describe, expect, it } from "vitest";
import { createEngine, makeSyncLayer } from "../../_helpers/factories.js";

const Page = {};

function setup(order: string[]) {
	const engine = createEngine();
	engine.sync({
		pagePath: [Page],
		layers: [makeSyncLayer("L", order)],
		modalLayers: [],
	});
	const calls: string[] = [];
	engine.pushOwner("L");
	engine.boundKeyboard(["q"], () => calls.push("plain-q"), {
		elementId: "plain",
	});
	engine.boundKeyboard(["c"], () => calls.push("plain-c"), {
		elementId: "plain",
	});
	engine.boundSequence(["q", "c"], () => calls.push("sequence-qc"), {
		elementId: "sequence",
	});
	engine.popOwner("L");
	return { engine, calls };
}

function expectSequenceOwnsBothKeys(order: string[]) {
	const { engine, calls } = setup(order);
	engine.processKey("q", {});
	engine.processKey("c", {});
	expect(calls, `element order: ${order.join(",")}`).toEqual(["sequence-qc"]);
}

describe("layer sequence priority across sibling elements", () => {
	it("gives the sequence both keys when the plain element is first", () => {
		expectSequenceOwnsBothKeys(["plain", "sequence"]);
	});

	it("gives the sequence both keys when the sequence element is first", () => {
		expectSequenceOwnsBothKeys(["sequence", "plain"]);
	});

	it("still runs plain bindings when no sequence matches", () => {
		const { engine, calls } = setup(["plain", "sequence"]);
		engine.processKey("c", {});
		expect(calls).toEqual(["plain-c"]);
	});

	it("keeps broadcasting to every plain element", () => {
		const engine = createEngine();
		engine.sync({
			pagePath: [Page],
			layers: [makeSyncLayer("L", ["p1", "p2"])],
			modalLayers: [],
		});
		const calls: string[] = [];
		engine.pushOwner("L");
		engine.boundKeyboard(["y"], () => calls.push("p1"), { elementId: "p1" });
		engine.boundKeyboard(["y"], () => calls.push("p2"), { elementId: "p2" });
		engine.popOwner("L");

		engine.processKey("y", {});
		expect(calls).toEqual(["p1", "p2"]);
	});

	it("applies the same priority inside a modal layer", () => {
		const engine = createEngine();
		engine.sync({
			pagePath: [Page],
			layers: [],
			modalLayers: [makeSyncLayer("M", ["plain", "sequence"])],
		});
		const calls: string[] = [];
		engine.pushOwner("M");
		engine.boundKeyboard(["q"], () => calls.push("plain-q"), {
			elementId: "plain",
		});
		engine.boundKeyboard(["c"], () => calls.push("plain-c"), {
			elementId: "plain",
		});
		engine.boundSequence(["q", "c"], () => calls.push("sequence-qc"), {
			elementId: "sequence",
		});
		engine.popOwner("M");

		engine.processKey("q", {});
		engine.processKey("c", {});
		expect(calls).toEqual(["sequence-qc"]);
	});
});
