import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CompositionContext,
	type CompositionKey,
} from "../../../src/CompositionEngine.js";
import { createEngine } from "../../_helpers/factories.js";

const Root = {};

afterEach(() => {
	vi.useRealTimers();
});

function syncEngine() {
	const engine = createEngine();
	engine.sync({ pagePath: [Root], layers: [], modalLayers: [] });
	return engine;
}

function head(
	engine: ReturnType<typeof createEngine>,
	extra: Partial<CompositionKey<unknown>> = {},
) {
	const entry: CompositionKey<unknown> = {
		key: "3",
		flags: [],
		alternativeFlag: "times",
		needs: [],
		execute: (ctx) => ({
			value: 1,
			lastFlag: "times",
			steps: [...ctx.steps, "3"],
		}),
		...extra,
	};
	engine.registryCompositionKey(entry);
}

function cont(
	engine: ReturnType<typeof createEngine>,
	extra: Partial<CompositionKey<unknown>> = {},
) {
	const entry: CompositionKey<unknown> = {
		key: "w",
		flags: [],
		alternativeFlag: "action",
		needs: ["times"],
		execute: (ctx) => ({
			value: ctx.value,
			lastFlag: "action",
			steps: [...ctx.steps, "w"],
		}),
		...extra,
	};
	engine.registryCompositionKey(entry);
}

describe("composition undo buffers — one recorded sequence stays one entry", () => {
	it("does not re-record a chain that already completed on timeout", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		engine.processKey("3", {});
		vi.advanceTimersByTime(600);
		expect(engine.bufferedCompositionCount()).toBe(1);

		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("keeps the count stable across repeated aborts", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		engine.processKey("3", {});
		vi.advanceTimersByTime(600);

		engine.abortComposition();
		engine.abortComposition();
		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("does not resurrect history after clearCompositionBuffers", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		engine.processKey("3", {});
		vi.advanceTimersByTime(600);

		engine.clearCompositionBuffers();
		expect(engine.bufferedCompositionCount()).toBe(0);

		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("runs each recorded undo action exactly once", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		const undoAction = vi.fn((ctx: CompositionContext) => ({
			...ctx,
			value: 0,
		}));
		head(engine, { undoAction });
		engine.processKey("3", {});
		vi.advanceTimersByTime(600);
		engine.abortComposition();

		expect(engine.undoComposition()).not.toBeNull();
		expect(undoAction).toHaveBeenCalledTimes(1);
		// Nothing left to rewind — the chain was recorded exactly once.
		expect(engine.bufferedCompositionCount()).toBe(0);
		expect(engine.undoComposition()).toBeNull();
		expect(undoAction).toHaveBeenCalledTimes(1);
	});

});

describe("mapping key timeouts — the entry's timeout is the one that counts", () => {
	it("expires a pending mapping on its own timeout, before the engine default", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"], { timeout: 50 })).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("started");

		// Past the entry's 50ms, still well inside the engine default (400ms).
		vi.advanceTimersByTime(200);
		expect(engine.processKey("h", {})).toBe(false);
	});

	it("keeps the entry timeout alive while advancing a longer sequence", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h", "i"], ["3"], { timeout: 50 })).toBe(
			true,
		);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("continued");

		vi.advanceTimersByTime(200);
		expect(engine.processKey("i", {})).toBe(false);
	});

	it("falls back to the engine default when the entry declares no timeout", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		vi.advanceTimersByTime(200);
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
	});

	it("re-seeds the timeout from the entry disambiguation locks onto", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		// The first entry seeds the pending state (and its generous timeout);
		// the second is the one the user actually completes.
		expect(
			engine.addMapping(["g", "h", "p", "q"], ["3"], { timeout: 900 }),
		).toBe(true);
		expect(
			engine.addMapping(["g", "h", "x", "y"], ["3"], { timeout: 50 }),
		).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("continued");

		// "x" rules out the first candidate; its 50ms timeout now applies.
		expect(engine.processKey("x", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("continued");

		vi.advanceTimersByTime(200);
		expect(engine.processKey("y", {})).toBe(false);
	});
});

describe("abort drops a half-typed mapping prefix", () => {
	it("does not let the next key complete a sequence cancelled by abort()", () => {
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("started");

		engine.abortComposition();
		expect(engine.hasPendingComposition()).toBe(false);

		expect(engine.processKey("h", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("cancelled");
	});

	it("lets a fresh mapped sequence start after abort()", () => {
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);

		engine.processKey("g", {});
		engine.abortComposition();

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("started");
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
	});
});

describe("mapped chains reach the undo ledger like typed keys", () => {
	it("records a single-key mapping's target chain", () => {
		const engine = syncEngine();
		const undoAction = vi.fn((ctx: CompositionContext) => ({
			...ctx,
			value: 0,
		}));
		head(engine, { undoAction });
		expect(engine.addMapping(["g"], ["3"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
		expect(engine.bufferedCompositionCount()).toBe(1);

		expect(engine.undoComposition()).not.toBeNull();
		expect(undoAction).toHaveBeenCalledTimes(1);
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("records a multi-key mapping per target key", () => {
		const engine = syncEngine();
		head(engine);
		cont(engine);
		expect(engine.addMapping(["g", "h"], ["3", "w"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
		expect(engine.bufferedCompositionCount()).toBe(1);

		// Same granularity as typing "3" then "w": undo-by-key peels one step.
		expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
		expect(engine.bufferedCompositionCount()).toBe(1);
		expect(engine.undoComposition(1, { byKey: true })).not.toBeNull();
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("records nothing when the target chain fails partway", () => {
		const engine = syncEngine();
		head(engine);
		// "q" can never follow "3" (it needs flag "other"), so the second
		// target key fails after the first one already executed.
		const dead: CompositionKey<unknown> = {
			key: "q",
			flags: [],
			alternativeFlag: "other",
			needs: ["other"],
			execute: (ctx) => ({
				value: ctx.value,
				lastFlag: "other",
				steps: [...ctx.steps, "q"],
			}),
		};
		engine.registryCompositionKey(dead);
		expect(engine.addMapping(["g", "h"], ["3", "q"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("broken");
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("records nothing for an empty target", () => {
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g"], [])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.bufferedCompositionCount()).toBe(0);
	});
});

describe("rejected continuations stay out of the ledger", () => {
	it("drops the partial chain when a when gate rejects the next key", () => {
		const engine = syncEngine();
		engine.addCondition("on", false);
		head(engine);
		cont(engine, { when: "on" });

		engine.processKey("3", {});
		expect(engine.processKey("w", {})).toBe(false);
		expect(engine.bufferedCompositionCount()).toBe(0);

		// A later abort must not resurrect the rejected partial chain either.
		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("still records a chain the author terminates with execute → null", () => {
		const engine = syncEngine();
		head(engine);
		cont(engine, { execute: () => null });

		engine.processKey("3", {});
		expect(engine.processKey("w", {})).toBe(false);
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("does not record a chain broken by an unmatched key", () => {
		const engine = syncEngine();
		engine.boundKeyboard(["z"], () => {});
		head(engine);

		engine.processKey("3", {});
		expect(engine.processKey("z", {})).toBe(false);
		expect(engine.getLastCompositionEvent()?.type).toBe("broken");
		expect(engine.bufferedCompositionCount()).toBe(0);
	});

	it("does not record a partial chain dropped by the value schema", () => {
		const engine = syncEngine();
		engine.setValueSchema({ times: () => true, action: () => true });
		head(engine);
		cont(engine);

		engine.processKey("3", {});
		engine.setValueSchema({ times: () => false, action: () => true });
		expect(engine.processKey("w", {})).toBe(false);
		expect(engine.bufferedCompositionCount()).toBe(0);
	});
});

describe("a dropped mapping prefix notifies subscribers", () => {
	it("notifies when the sequence times out", () => {
		vi.useFakeTimers();
		const engine = syncEngine();
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"])).toBe(true);
		const sub = vi.fn();
		engine.subscribeMapping(sub);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("started");

		sub.mockClear();
		vi.advanceTimersByTime(600);
		expect(sub).toHaveBeenCalledTimes(1);
		expect(engine.getLastMappingEvent()?.type).toBe("cancelled");

		// The prefix is gone — the next key must not complete the sequence.
		expect(engine.processKey("h", {})).toBe(false);
	});

	it("notifies once when abort() drops the prefix, not on every abort()", () => {
		const engine = syncEngine();
		head(engine);
		engine.addMapping(["g", "h"], ["3"]);
		const sub = vi.fn();
		engine.subscribeMapping(sub);

		engine.processKey("g", {});
		sub.mockClear();

		engine.abortComposition();
		expect(sub).toHaveBeenCalledTimes(1);
		expect(engine.getLastMappingEvent()?.type).toBe("cancelled");

		engine.abortComposition();
		expect(sub).toHaveBeenCalledTimes(1);
	});

	it("notifies when undo() drops the prefix", () => {
		const engine = syncEngine();
		head(engine);
		engine.addMapping(["g", "h"], ["3"]);

		engine.processKey("g", {});
		expect(engine.undoComposition()).toBeNull();
		expect(engine.getLastMappingEvent()?.type).toBe("cancelled");
	});
});

describe("mapping entries honour their when gate", () => {
	it("skips a single-key mapping whose gate is closed", () => {
		const engine = syncEngine();
		engine.addCondition("on", false);
		head(engine);
		expect(engine.addMapping(["g"], ["3"], { when: "on" })).toBe(true);

		// Gate closed — the mapping is skipped and there is no composition
		// entry for "g", so the key falls through untouched.
		expect(engine.processKey("g", {})).toBe(false);

		engine.setCondition("on", true);
		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
	});

	it("re-evaluates the gate on each key of a multi-key mapping", () => {
		const engine = syncEngine();
		engine.addCondition("on", true);
		head(engine);
		expect(engine.addMapping(["g", "h"], ["3"], { when: "on" })).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		// The gate closes mid-sequence — the pending prefix is dropped.
		engine.setCondition("on", false);
		expect(engine.processKey("h", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("broken");
	});
});

describe("mapped target chains obey the same gates as typed keys", () => {
	it("honours a target key's when gate", () => {
		const engine = syncEngine();
		engine.addCondition("on", false);
		head(engine);
		cont(engine, { when: "on" });
		expect(engine.addMapping(["g", "h"], ["3", "w"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("broken");
	});

	it("uses the declared flag transition when execute returns a null lastFlag", () => {
		const engine = syncEngine();
		head(engine);
		engine.registryCompositionKey({
			key: "w",
			flags: [{ need: "times", become: "chained" }],
			alternativeFlag: "fallback",
			needs: ["times"],
			execute: (ctx) => ({
				value: ctx.value,
				lastFlag: null,
				steps: [...ctx.steps, "w"],
			}),
		});
		// "e" only continues from the declared "chained" flag, never "fallback".
		engine.registryCompositionKey({
			key: "e",
			flags: [],
			alternativeFlag: "done",
			needs: ["chained"],
			execute: (ctx) => ({
				value: ctx.value,
				lastFlag: "done",
				steps: [...ctx.steps, "e"],
			}),
		});
		expect(engine.addMapping(["g", "h", "j"], ["3", "w", "e"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(true);
		expect(engine.processKey("j", {})).toBe(true);
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
	});
});

describe("a mapped chain that ends by design still reaches the undo ledger", () => {
	it("completes and records when a target key matches an end key", () => {
		const engine = syncEngine();
		const undo3 = vi.fn((ctx: CompositionContext) => ({ ...ctx, value: 0 }));
		head(engine, { undoAction: undo3 });
		cont(engine, { isEndKey: ["times"] });
		expect(engine.addMapping(["g", "h"], ["3", "w"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(true);
		// The end key is the chain's declared finish line, not an interruption.
		expect(engine.getLastMappingEvent()?.type).toBe("completed");
		// Typing "3" then "w" records "3" the same way.
		expect(engine.bufferedCompositionCount()).toBe(1);
		expect(engine.undoComposition()).not.toBeNull();
		expect(undo3).toHaveBeenCalledTimes(1);
	});

	it("stays broken but records what already executed when execute returns null", () => {
		const engine = syncEngine();
		const undo3 = vi.fn((ctx: CompositionContext) => ({ ...ctx, value: 0 }));
		head(engine, { undoAction: undo3 });
		engine.registryCompositionKey({
			key: "q",
			flags: [],
			alternativeFlag: "other",
			needs: ["times"],
			execute: () => null,
		});
		expect(engine.addMapping(["g", "h"], ["3", "q"])).toBe(true);

		expect(engine.processKey("g", {})).toBe(true);
		expect(engine.processKey("h", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("broken");
		expect(engine.bufferedCompositionCount()).toBe(1);
		expect(engine.undoComposition()).not.toBeNull();
		expect(undo3).toHaveBeenCalledTimes(1);
	});
});

describe("a released single-key mapping does not fall through to composition", () => {
	it("runs only the mapping, never a composition key sharing the head", () => {
		const engine = syncEngine();
		// A target that terminates immediately, so the mapping is released
		// (KeyReleaseWhenChainInterrupted defaults to false).
		engine.registryCompositionKey({
			key: "bad",
			flags: [],
			alternativeFlag: "times",
			needs: [],
			execute: () => null,
		});
		expect(engine.addMapping(["g"], ["bad"])).toBe(true);

		const gExec = vi.fn((ctx: CompositionContext) => ({
			...ctx,
			lastFlag: "gflag",
		}));
		engine.registryCompositionKey({
			key: "g",
			flags: [],
			alternativeFlag: "gflag",
			needs: [],
			execute: gExec,
		});

		expect(engine.processKey("g", {})).toBe(false);
		expect(engine.getLastMappingEvent()?.type).toBe("broken");
		// The head key matched a mapping, so the composition entry must not
		// also fire on the same physical key.
		expect(gExec).not.toHaveBeenCalled();
	});
});

describe("undo removes only the sequences it actually undid", () => {
	function headEntry(
		engine: ReturnType<typeof createEngine>,
		key: string,
		undoAction: NonNullable<CompositionKey<unknown>["undoAction"]>,
	) {
		engine.registryCompositionKey({
			key,
			flags: [],
			alternativeFlag: "times",
			needs: [],
			execute: (ctx) => ({
				value: 1,
				lastFlag: "times",
				steps: [...ctx.steps, key],
			}),
			undoAction,
		});
	}

	it("keeps the older sequence whose undoAction stops the walk (isolated)", () => {
		const engine = syncEngine();
		const stop = vi.fn(() => null);
		headEntry(engine, "a", stop);
		headEntry(engine, "b", (ctx) => ({ ...ctx, value: 0 }));

		engine.processKey("a", {});
		engine.abortComposition();
		engine.processKey("b", {});
		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(2);

		// Newest-first: "b" is undone, then "a" stops the walk.
		expect(engine.undoComposition(2, { isolated: true })).not.toBeNull();
		expect(stop).toHaveBeenCalled();
		// Only "b" was undone; "a" must stay buffered.
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("keeps the older sequence whose undoAction stops the walk (flat)", () => {
		const engine = syncEngine();
		const stop = vi.fn(() => null);
		headEntry(engine, "a", stop);
		headEntry(engine, "b", (ctx) => ({ ...ctx, value: 0 }));

		engine.processKey("a", {});
		engine.abortComposition();
		engine.processKey("b", {});
		engine.abortComposition();

		expect(engine.undoComposition(2)).not.toBeNull();
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("reports zero when a flat undo only truncates a sequence", () => {
		const engine = syncEngine();
		const stop = vi.fn(() => null);
		head(engine, { undoAction: stop }); // "3" stops the walk
		cont(engine, { undoAction: (ctx) => ({ ...ctx, value: 0 }) }); // "w"

		engine.processKey("3", {});
		engine.processKey("w", {});
		engine.abortComposition();

		// Flat: "w" undoes, then "3" stops the walk. The sequence is
		// truncated, no sequence completed, and — unlike the isolated path —
		// the flat path still returns its seeded context.
		expect(engine.undoComposition(1)).not.toBeNull();
		expect(engine.getLastCompositionEvent()).toEqual({
			type: "undone",
			steps: 0,
		});
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("reports how many sequences were actually undone", () => {
		const engine = syncEngine();
		const stop = vi.fn(() => null);
		head(engine, { undoAction: stop }); // "3" → times, stops the walk
		cont(engine, { undoAction: (ctx) => ({ ...ctx, value: 0 }) }); // "w"
		headEntry(engine, "c", (ctx) => ({ ...ctx, value: 0 }));

		engine.processKey("3", {});
		engine.processKey("w", {});
		engine.abortComposition();
		engine.processKey("c", {});
		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(2);

		// "c" is undone, then the "3 w" walk stops at "3", truncating that
		// sequence. One sequence was undone — not the requested two.
		expect(engine.undoComposition(2, { isolated: true })).not.toBeNull();
		expect(engine.getLastCompositionEvent()).toEqual({
			type: "undone",
			steps: 1,
		});
		expect(engine.bufferedCompositionCount()).toBe(1);
	});

	it("truncates a partially-undone sequence and never replays its actions", () => {
		const engine = syncEngine();
		const stop = vi.fn(() => null);
		const undoW = vi.fn((ctx: CompositionContext) => ({ ...ctx, value: 0 }));
		const undoQ = vi.fn((ctx: CompositionContext) => ({ ...ctx, value: 0 }));
		head(engine, { undoAction: stop }); // "3" → times
		cont(engine, { undoAction: undoW }); // "w" → action, needs times
		engine.registryCompositionKey({
			key: "q",
			flags: [],
			alternativeFlag: "done",
			needs: ["action"],
			execute: (ctx) => ({
				value: ctx.value,
				lastFlag: "done",
				steps: [...ctx.steps, "q"],
			}),
			undoAction: undoQ,
		});

		engine.processKey("3", {});
		engine.processKey("w", {});
		engine.processKey("q", {});
		engine.abortComposition();
		expect(engine.bufferedCompositionCount()).toBe(1);

		// Newest-first: "q" and "w" undo, then "3" stops the walk — no
		// sequence completes, so the walk returns null. The two undone
		// entries must still be removed so their actions cannot run twice.
		expect(engine.undoComposition(1, { isolated: true })).toBeNull();
		expect(undoW).toHaveBeenCalledTimes(1);
		expect(undoQ).toHaveBeenCalledTimes(1);
		// The ledger changed (a truncation), so subscribers are notified even
		// though no sequence was undone in full and `undo` returned null.
		expect(engine.getLastCompositionEvent()).toEqual({
			type: "undone",
			steps: 0,
		});
		// No active chain afterwards: `undo` reset the context up front, so
		// no flag from the undone chain leaks into the next resolution.
		expect(engine.getCompositionContext()).toEqual({
			value: undefined,
			lastFlag: null,
			steps: [],
		});
		// The sequence is truncated, not dropped: exactly one entry ("3")
		// survives, so a by-key undo of two has nothing to walk.
		expect(() => engine.undoComposition(2, { byKey: true })).toThrow();

		engine.undoComposition(1, { isolated: true });
		expect(undoW).toHaveBeenCalledTimes(1);
		expect(undoQ).toHaveBeenCalledTimes(1);
	});
});

describe("when-gated composition entries are distinct and selectable", () => {
	it("keeps entries differing only by their string when and picks the open one", () => {
		const engine = syncEngine();
		engine.addCondition("a", true);
		engine.addCondition("b", true);
		const first = vi.fn((ctx: CompositionContext) => ({
			value: 1,
			lastFlag: "times",
			steps: [...ctx.steps, "3"],
		}));
		const second = vi.fn((ctx: CompositionContext) => ({
			value: 2,
			lastFlag: "times",
			steps: [...ctx.steps, "3"],
		}));
		engine.registryCompositionKey({
			key: "3",
			flags: [],
			alternativeFlag: "times",
			needs: [],
			when: "a",
			execute: first,
		});
		engine.registryCompositionKey({
			key: "3",
			flags: [],
			alternativeFlag: "times",
			needs: [],
			when: "b",
			execute: second,
		});

		// Two entries differ only by their `when`, so both are kept.
		// Both gates open: resolution keeps the first-registered entry.
		expect(engine.processKey("3", {})).toBe(true);
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).not.toHaveBeenCalled();

		// Closing the first gate must expose the sibling, not an empty set.
		// If dedup had merged the two entries, this key would fall through.
		engine.setCondition("a", false);
		expect(engine.processKey("3", {})).toBe(true);
		expect(second).toHaveBeenCalledTimes(1);
	});
});
