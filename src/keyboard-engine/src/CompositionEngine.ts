import { checkWhen } from "./checkWhen.js";
import EngineState from "./engine/EngineState.js";
import type { PipelineContext } from "./types.js";

/**
 * Runtime type guard for a value flowing through a composition chain.
 *
 * Returns `true` when the value matches the expected shape for a given flag.
 *
 * @example
 * ```ts
 * const schema: ValueSchema = {
 *   times: (v): v is number => typeof v === 'number',
 *   action: (v): v is number => typeof v === 'number',
 * };
 * ```
 */
export type ValueGuard = (value: unknown) => boolean;

/**
 * Maps flag names to {@link ValueGuard} functions.
 *
 * When provided to {@link CompositionEngine}, each execute callback's
 * input and output values are validated against the guards declared for
 * the corresponding flags. Validation failures clear the pending chain
 * and emit a `console.warn` in development.
 */
export type ValueSchema = Record<string, ValueGuard>;

/**
 * Select the best-matching {@link CompositionKey} by looking up every name
 * in `eventNames` against the given mapping table.
 *
 * Resolution priority (highest first):
 * 1. **needs match** — entries whose `needs` include `lastFlag` are
 *    preferred. When `lastFlag` is null (head of chain), entries that are
 *    `optional` or have no `needs` are preferred.
 * 2. **modifier specificity** — entries with more `+` segments in their
 *    key name (e.g. `"ctrl+s"` over `"s"`) rank higher.
 * 3. **needs length** — among entries with the same modifier count, a
 *    longer `needs` list (stricter contract) wins.
 *
 * @returns The resolved entry, or `null` if no entry matches any name in `eventNames`.
 */
export function resolveCompositionKey<TComponent = unknown>(
	candidates: CompositionKey<TComponent>[],
	lastFlag: string | null,
): CompositionKey<TComponent> | null {
	if (candidates.length === 0) return null;

	// Round 1 — filter by needs / lastFlag compatibility
	const needsMatch = candidates.filter((entry) => {
		if (lastFlag === null) {
			return entry.optional === true || entry.needs.length === 0;
		}
		return entry.needs.includes(lastFlag);
	});

	if (needsMatch.length === 0) return null;

	const pool = needsMatch;
	if (pool.length === 1) return pool[0];

	// Round 2 — prefer entries with more modifier segments (e.g. "ctrl+s" > "s")
	const modifierCount = (k: string): number => (k.match(/\+/g) || []).length;

	pool.sort((a, b) => modifierCount(b.key) - modifierCount(a.key));

	const topModifiers = modifierCount(pool[0].key);
	const sameSpecificity = pool.filter(
		(c) => modifierCount(c.key) === topModifiers,
	);

	// Round 3 — prefer stricter contracts (longer needs list)
	if (sameSpecificity.length > 1) {
		sameSpecificity.sort((a, b) => b.needs.length - a.needs.length);
	}

	return sameSpecificity[0];
}

/**
 * A single flag transition declared by a composition key: `need` is the
 * preceding flag required to fire the transition, `become` is the flag
 * assigned afterwards.
 */
export type FlagTransition = {
	/** The preceding flag required to fire the transition. */
	need: string;
	/** The flag assigned when the transition fires. */
	become: string;
};

/**
 * Flag transitions declared by a composition key — one entry per
 * preceding-flag match, each specifying the flag assigned afterwards.
 */
export type Flags = FlagTransition[];

/**
 * Fired when a new composition chain starts: a head key (`optional: true`
 * or empty `needs`) matched and its `execute` callback ran successfully.
 */
export interface CompositionStartedEvent {
	/** Event discriminant — always `"started"`. */
	type: "started";
	/** The head key that started the chain. */
	key: string;
}

/**
 * Fired when a pending chain advances to the next key: the key matched
 * the pending `lastFlag` and its `execute` callback ran successfully.
 */
export interface CompositionContinuedEvent {
	/** Event discriminant — always `"continued"`. */
	type: "continued";
	/** The key that advanced the chain. */
	key: string;
}

/**
 * Fired when a pending chain completes: the chain timeout expired, an end
 * key matched, or `execute` returned `null`. The chain's keys are recorded
 * in the undo buffer at this point.
 */
export interface CompositionCompletedEvent {
	/** Event discriminant — always `"completed"`. */
	type: "completed";
}

/**
 * Fired when a pending chain is cancelled immediately via
 * {@link CompositionEngine#abort}.
 */
export interface CompositionAbortedEvent {
	/** Event discriminant — always `"aborted"`. */
	type: "aborted";
}

/**
 * Fired when a key with no matching entry breaks a pending chain: the
 * pending state is cleared and the key falls through to lower pipeline
 * stages (unless the breaking key is swallowed).
 */
export interface CompositionBrokenEvent {
	/** Event discriminant — always `"broken"`. */
	type: "broken";
	/** The key that broke the chain. */
	key: string;
}

/**
 * Fired when an exclusive pending chain silently consumes a mismatched
 * key: the chain keeps waiting and the key does not reach lower pipeline
 * stages.
 */
export interface CompositionConsumedEvent {
	/** Event discriminant — always `"consumed"`. */
	type: "consumed";
	/** The mismatched key that was consumed. */
	key: string;
}

/**
 * Fired when one or more completed sequences are undone via
 * {@link CompositionEngine#undo}.
 */
export interface CompositionUndoneEvent {
	/** Event discriminant — always `"undone"`. */
	type: "undone";
	/**
	 * Number of undone sequences (or individual keys, when `undo` was
	 * called with `{ byKey: true }`). A sequence whose `undoAction` returned
	 * `null` and stopped the walk was not undone — it stays buffered (any
	 * entries already undone are dropped) and is not counted, so an `undo`
	 * that only truncated a sequence reports `0`. In isolated mode such a
	 * call also returns `null`; the flat path still returns its seeded
	 * context.
	 */
	steps: number;
}

/**
 * Fired when the buffered undo history is cleared via
 * {@link CompositionEngine#clearBuffers}.
 */
export interface CompositionClearedEvent {
	/** Event discriminant — always `"cleared"`. */
	type: "cleared";
}

/**
 * State-change events emitted by the composition engine during a key chain's
 * lifecycle.
 */
export type CompositionEvent =
	| CompositionStartedEvent
	| CompositionContinuedEvent
	| CompositionCompletedEvent
	| CompositionAbortedEvent
	| CompositionBrokenEvent
	| CompositionConsumedEvent
	| CompositionUndoneEvent
	| CompositionClearedEvent;

/**
 * Fired when a mapping-key sequence starts: the head key matched a
 * registered mapping key and its target chain is about to run.
 */
export interface MappingKeyStartedEvent {
	/** Event discriminant — always `"started"`. */
	type: "started";
	/** The head key that started the sequence. */
	key: string;
}

/**
 * Fired when a pending mapping-key sequence advances to the next key:
 * the pressed key matched the next segment of the remaining candidates.
 */
export interface MappingKeyContinuedEvent {
	/** Event discriminant — always `"continued"`. */
	type: "continued";
	/** The key that advanced the sequence. */
	key: string;
}

/**
 * Fired when a mapping-key sequence completes and its target composition
 * chain ran end-to-end successfully.
 */
export interface MappingKeyCompletedEvent {
	/** Event discriminant — always `"completed"`. */
	type: "completed";
}

/**
 * Fired when a mismatched key breaks a pending mapping-key sequence: the
 * pending state is cleared and the key falls through to lower pipeline
 * stages (unless the breaking key is swallowed).
 */
export interface MappingKeyBrokenEvent {
	/** Event discriminant — always `"broken"`. */
	type: "broken";
	/** The key that broke the sequence. */
	key: string;
}

/**
 * Fired when an exclusive pending mapping-key sequence silently consumes
 * a mismatched key: the sequence keeps waiting and the key does not reach
 * lower pipeline stages.
 */
export interface MappingKeyConsumedEvent {
	/** Event discriminant — always `"consumed"`. */
	type: "consumed";
	/** The mismatched key that was consumed. */
	key: string;
}

/**
 * Fired when a pending mapping-key sequence is dropped before completing:
 * its timer expired, {@link CompositionEngine#abort} was called, or
 * {@link CompositionEngine#undo} cancelled it.
 *
 * No target key has executed at this point, so there is nothing to undo —
 * this event exists so subscribers can clear a "waiting for the next key"
 * state. Without it, a timeout is indistinguishable from a sequence that
 * is still in progress.
 */
export interface MappingKeyCancelledEvent {
	/** Event discriminant — always `"cancelled"`. */
	type: "cancelled";
}

/**
 * State-change events emitted by the mapping-key subsystem.
 *
 * Kept separate from {@link CompositionEvent} so subscribers of one
 * subsystem are not notified by the other. The shape mirrors
 * CompositionEvent but is intentionally smaller — mapping keys do not
 * have an "aborted" / "undone" / "cleared" lifecycle.
 */
export type MappingKeyEvent =
	| MappingKeyStartedEvent
	| MappingKeyContinuedEvent
	| MappingKeyCompletedEvent
	| MappingKeyBrokenEvent
	| MappingKeyConsumedEvent
	| MappingKeyCancelledEvent;

/**
 * State of an active composition chain waiting for the next key.
 */
export interface CompositionPending {
	timeout: number;
	timer: ReturnType<typeof setTimeout>;
	/** When true, mismatched keys in mid-sequence are silently consumed. */
	exclusive: boolean;
	/** Which pipeline phase this pending chain belongs to. */
	affectOverlay: boolean;
}

/**
 * Context passed to and returned by composition key `execute` callbacks.
 */
export interface CompositionContext<T = unknown> {
	/**
	 * The value currently passed through the context.
	 */
	value: T;

	/**
	 * Flag of the previous key in the chain. When `null`, this key is the
	 * head key of a new chain.
	 */
	lastFlag: string | null;

	/**
	 * Keys that have been executed in the current sequence
	 */
	steps: string[];
}

/**
 * A registered composition key: the trigger key, its flags, and how it
 * transforms the {@link CompositionContext}.
 */
export interface CompositionKey<
	TComponent,
	TValue = unknown,
> extends PrimitiveTypeKeys<TComponent> {
	/**
	 * Trigger key name(s), e.g. `a`, `B`, `3`, or `"ctrl+s"`.
	 */
	key: string;

	/**
	 * Declare what this key becomes after execution. The next key in the
	 * chain uses these flags to recognize its predecessor. Flags are
	 * auto-registered when not already known.
	 */
	flags: Flags;

	/**
	 * Flags this key expects on the preceding key. When the preceding flag
	 * does not match, the key is discarded.
	 */
	needs: string[];

	/** Fallback flag used when no `needs` entry matches, or at the head of a chain. */
	alternativeFlag: string;

	/**
	 * Whether the preceding flag is optional. When `true` and no chain is
	 * pending, the key executes automatically as a head key. When a chain is
	 * already pending, the preceding flag is still checked.
	 */
	optional?: boolean;

	/** Timeout for the next key press in the sequence, in milliseconds. */
	timeout?: number;

	/**
	 * When `true` and a needs mismatch occurs mid-sequence, the key is
	 * silently consumed (the timeout keeps running). When `false` or
	 * omitted, a mismatched key clears the pending chain and falls through.
	 */
	exclusive?: boolean;

	/**
	 * Transform the composition context when this key fires. Receives the
	 * current chain context and returns the modified context passed to the
	 * next key in the chain, or `null` to terminate the chain — the key is
	 * then released to lower pipeline stages, or silently swallowed when
	 * `KeyReleaseWhenChainInterrupted` is set.
	 */
	execute?: (
		ctx: CompositionContext<TValue>,
	) => CompositionContext<TValue> | null;

	/**
	 * When `true` and `execute` returns `null`, the breaking key is silently
	 * swallowed after the chain terminates instead of being released to lower
	 * pipeline stages.
	 */
	KeyReleaseWhenChainInterrupted?: boolean;

	/**
	 * The inverse of `execute`, run when the sequence is undone. Returning
	 * `null` stops the undo action.
	 */
	undoAction?: undo;

	/**
	 * When the chain's current `lastFlag` is in this list, the key terminates
	 * the chain. `execute` still runs (its side effects happen), but its
	 * returned context is discarded and the key is not recorded in the undo
	 * buffer — only the keys preceding it are.
	 */
	isEndKey?: string[];
}

/**
 * Undo action for a single composition key.
 */
export type undo<TValue = unknown> = (
	ctx: CompositionContext<TValue>,
) => CompositionContext<TValue> | null;

/**
 * One executed key recorded in a completed sequence, keeping its undo action
 * and the context at the time of execution.
 */
export type bufferEntry = {
	key: string;
	undoAction: undo;
	ctx: CompositionContext;
};

/**
 * Outcome of running one resolved composition key via
 * {@link CompositionEngine.executeResolvedKey}: either the transformed
 * context, or the reason the key did not advance the chain.
 *
 * `reason` distinguishes a gate rejection (`input`, `output`) from a
 * deliberate termination (`terminate` when `execute` returned `null`,
 * `endkey` when the previous flag was listed in `isEndKey`) — only the
 * latter two are recorded in the undo buffer. A closed `when` gate is not
 * a `KeyOutcome`: it is filtered out before resolution.
 */
type KeyOutcome =
	| { ok: true; ctx: CompositionContext }
	| {
			ok: false;
			reason: "input" | "terminate" | "endkey" | "output";
			release: boolean;
	  };

/**
 * Result of attempting to start a mapping-key sequence:
 * - `"none"`     — no mapping applied; the caller may fall through to the
 *                  composition chain and lower pipeline stages.
 * - `"consumed"` — a mapping ran (or a multi-key sequence started) and the
 *                  event is fully handled.
 * - `"released"` — a mapping head key matched but its target chain broke and
 *                  the mapping opted to release the key; the caller must not
 *                  run the composition chain on the same key.
 */
type MappingStartOutcome = "none" | "consumed" | "released";

/**
 * State of a pending mapping-key sequence waiting for the next key.
 */
export interface MappingPendingEntry<TComponent> {
	keys: string[];
	nextIndex: number;
	timeout: number;
	timer: ReturnType<typeof setTimeout>;
	exclusive: boolean;
	affectOverlay: boolean;
	candidates: MappingKeyEntry<TComponent>[];
	/**
	 * The `when` gate of the entry that seeded (or, after disambiguation,
	 * locked in) the sequence. Re-evaluated on every key; a `false` result
	 * cancels the sequence. Mirrors the `when` carried on a global pending
	 * sequence.
	 */
	when?: (() => boolean) | string;
}

/**
 * A registered mapping key: an external key sequence (`keys`) that triggers
 * a target composition chain (`target`) when fully typed.
 */
export interface MappingKeyEntry<
	TComponent,
> extends PrimitiveTypeKeys<TComponent> {
	/**
	 * External key sequence the user must type (e.g. `["g", "i"]`).
	 */
	keys: string[];
	/**
	 * Internal composition keys to execute in order.
	 */
	target: string[];
	/**
	 * Timeout for the next key in the sequence, in milliseconds.
	 */
	timeout?: number;
	/**
	 * When `true`, keys that break the pending mapping sequence are silently
	 * consumed and the sequence keeps waiting.
	 */
	exclusive?: boolean;
	/**
	 * When `true`, if the target composition chain is interrupted (any
	 * target key fails to resolve / execute), the final key that broke
	 * the sequence is swallowed silently instead of being released to
	 * lower pipeline stages. Mirrors {@link CompositionKey.KeyReleaseWhenChainInterrupted}.
	 */
	KeyReleaseWhenChainInterrupted?: boolean;
}

/**
 * Fields shared by composition keys and mapping keys.
 */
export interface PrimitiveTypeKeys<TComponent> {
	/**
	 * The entry is enabled only while this callback (or named condition id)
	 * returns `true`. Evaluated while filtering candidates, so an entry
	 * whose gate is closed is skipped before resolution — a sibling entry
	 * for the same key whose gate is open can still match.
	 */
	when?: (() => boolean) | string;
	/**
	 * Which pipeline phase this entry fires in: `true` = layer phase
	 * (before the layer broadcast), `false` = page phase (after the
	 * layer broadcast, before the screen stack).
	 */
	affectOverlay?: boolean;
	/**
	 * Restrict the entry to a specific mode. When the active mode does
	 * not match, the entry is skipped. Omitted = fires in all modes.
	 */
	mode?: string;
	/**
	 * Top-component whitelist: `"*"` or omitted = all screens; `[]` =
	 * no screens (effectively disabled); `[A, B]` = only when the
	 * stack top is exactly A or B.
	 */
	category?: TComponent[] | "*";
	/**
	 * When `true`, an overlay-phase entry (`affectOverlay: true`) fires
	 * even while no layer is open. With the default `false`, the entry
	 * is skipped when no layers exist. Only relevant when
	 * `affectOverlay` is `true`.
	 */
	executeWhenNoOverlay?: boolean;
}

function compositionFingerprint<TComponent>(
	entry: CompositionKey<TComponent>,
): string {
	return JSON.stringify({
		key: entry.key,
		flags: entry.flags,
		needs: entry.needs,
		alternativeFlag: entry.alternativeFlag,
		optional: entry.optional,
		category: entry.category,
		affectOverlay: entry.affectOverlay,
		exclusive: entry.exclusive,
		executeWhenNoOverlay: entry.executeWhenNoOverlay,
		KeyReleaseWhenChainInterrupted: entry.KeyReleaseWhenChainInterrupted,
		isEndKey: entry.isEndKey,
		mode: entry.mode,
		timeout: entry.timeout,
		// A string `when` is a stable condition id and part of the entry's
		// identity — otherwise two entries that differ only by their gate
		// would collide. A function `when` is a fresh reference every React
		// render and must stay out of the fingerprint (undefined keys are
		// dropped by JSON.stringify).
		when: typeof entry.when === "string" ? entry.when : undefined,
	});
}

/**
 * State machine for multi-key composition chains (vim-style key sequences).
 *
 * Builds "flag → needs → execute" chains: pressing key "A" sets
 * `lastFlag: "A"` and produces a value; the next key "B" (with
 * `needs: ["A"]`) receives that value via its `execute(ctx)` callback,
 * transforms it, and passes it forward. The chain continues until a key
 * with no matching entry is pressed or the timeout expires.
 *
 * Entry resolution uses `needs` matching: when a pending chain exists,
 * only keys whose `needs` include `lastFlag` are eligible; when no chain
 * is pending, only keys with `optional: true` or empty `needs` can start
 * one.
 *
 * Owns the key mapping table, pending chain state, mapping-key sequences,
 * and undo buffers. Driven by the composition pipeline processors; exposed
 * on {@link KeyboardEngine} for direct registration and inspection.
 */
export default class CompositionEngine<TComponent = unknown> {
	private currentKey: string[] = [];
	private keyMappingTable: Map<string, Set<CompositionKey<TComponent>>> =
		new Map();

	private defaultTimeout: number;

	// Keys pressed in the current sequence, in press order. Reset at the
	// start of each sequence; snapshots are pushed into `buffers` so undo
	// history survives across sequences.
	private historyKeys: bufferEntry[] = [];
	// Each inner array represents one completed sequence's key history.
	// Multiple sequences accumulate here so undo can rewind across
	// several completed chains.
	private buffers: bufferEntry[][] = [];

	private valueSchema: ValueSchema | undefined;

	private subscribers: Set<() => void> = new Set();
	private lastEvent: CompositionEvent | null = null;

	// Separate subscriber pool for the mapping-key subsystem so its
	// state changes do not fire composition subscribers (and vice versa).
	private mappingSubscribers: Set<() => void> = new Set();
	private lastMappingEvent: MappingKeyEvent | null = null;

	private mapping: Map<string, Set<MappingKeyEntry<TComponent>>> = new Map();
	// Mapping keys keep their own pending sequence so mapped-key chains and
	// ordinary composition chains are easier to distinguish and manage. The
	// two kinds of pending sequence cannot coexist.
	private mappingPendingEntry: MappingPendingEntry<TComponent> | null = null;
	private pendingEntry: CompositionPending | null = null;

	private context: CompositionContext = {
		value: undefined,
		lastFlag: null,
		steps: [],
	};

	constructor(
		private state: EngineState<TComponent>,
		defaultTimeout?: number,
		valueSchema?: ValueSchema,
	) {
		this.defaultTimeout = defaultTimeout ?? 400;
		this.valueSchema = valueSchema;
	}

	/**
	 * Set or replace the runtime value schema for composition chain
	 * validation.
	 *
	 * The schema replaces the previous one entirely (no merging). For each
	 * composition key event the engine validates the input value before
	 * `execute` runs (against the `lastFlag`'s guard) and the output value
	 * afterwards (against the current flag's guard). Flags without a guard
	 * entry pass through silently. Validation failures clear the pending
	 * chain and emit a `console.warn` in development.
	 *
	 * @param schema - Guard functions keyed by flag name.
	 */
	setValueSchema(schema: ValueSchema): void {
		this.valueSchema = schema;
	}

	private checkMapping(
		set: Set<{
			keys: string[];
			target: string[];
		}>,
		newKeys: string[],
	): boolean {
		const newKeysStr = JSON.stringify(newKeys);

		for (const each of set) {
			const existingKeysStr = JSON.stringify(each.keys);
			if (existingKeysStr === newKeysStr) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Register a mapping key entry — vim-style key mapping that maps an
	 * external key sequence (`base`) to an internal composition key chain
	 * (`target`).
	 *
	 * Entries are stored in `this.mapping` (a `Map<string, Set<MappingKeyEntry>>`)
	 * keyed by `base[0]`. When a key event matches `base[0]`:
	 * - single-key mappings (`base.length === 1`) execute their target chain
	 *   immediately;
	 * - multi-key mappings create a pending entry and wait for the
	 *   subsequent keys.
	 *
	 * Mapping-key pending and ordinary composition pending are mutually
	 * exclusive, and mapping keys take priority: they are checked inside
	 * `startPending` before single-key composition startup.
	 *
	 * @param base   The external trigger key sequence (what the user presses).
	 * @param target The internal composition key chain to execute in order.
	 * @param options Optional fields forwarded to the stored {@link MappingKeyEntry}:
	 *   `exclusive`, `KeyReleaseWhenChainInterrupted`, `when`, `affectOverlay`,
	 *   `mode`, `category`, `executeWhenNoOverlay`.
	 * @returns `true` if registered, `false` if `base` is empty, any `target`
	 *          key is not registered in `keyMappingTable`, or an identical
	 *          `base` sequence already exists.
	 *
	 * @example
	 * ```ts
	 * engine.registryCompositionKey({
	 *   key: 't', flags: [], alternativeFlag: 'times',
	 *   optional: true, needs: [],
	 *   execute: (ctx) => ({ ...ctx, lastFlag: 'times', steps: [...ctx.steps, 't'] }),
	 * });
	 * engine.registryCompositionKey({
	 *   key: 'd', flags: [], alternativeFlag: 'action',
	 *   needs: ['times'],
	 *   execute: (ctx) => ({ ...ctx, lastFlag: 'action', steps: [...ctx.steps, 'd'] }),
	 * });
	 *
	 * // Map 'g b' → 't d'
	 * engine.composition.addMapping(['g', 'b'], ['t', 'd']);
	 *
	 * // Single-key mapping and exclusive multi-key mapping
	 * engine.composition.addMapping(['q'], ['t']);
	 * engine.composition.addMapping(['g', 'd'], ['t'], { exclusive: true });
	 *
	 * // Remove a mapping
	 * engine.composition.removeMappingKey(['g', 'b']);
	 * ```
	 */
	addMapping(
		base: string[],
		target: string[],
		options?: Omit<MappingKeyEntry<TComponent>, "keys" | "target">,
	) {
		if (base.length === 0) {
			return false;
		}

		for (const each of target) {
			if (!this.keyMappingTable.has(each)) {
				return false;
			}
		}

		const entry: MappingKeyEntry<TComponent> = {
			keys: base,
			target: target,
			...options,
		};

		const firstKey = base[0];
		const mapKey = this.mapping.get(firstKey);
		if (mapKey) {
			const repetitive = this.checkMapping(mapKey, base);
			if (repetitive) {
				return false;
			}

			mapKey.add(entry);
		} else {
			this.mapping.set(
				firstKey,
				new Set([entry]),
			);
		}

		return true;
	}

	/**
	 * Remove a mapping key entry by its exact key sequence.
	 * @returns `true` if found and removed, `false` otherwise.
	 */
	removeMappingKey(keys: string[]) {
		const firstKey = keys[0];
		const mappingKey = this.mapping.get(firstKey);
		if (!mappingKey) {
			return false;
		}

		const stringArray = JSON.stringify(keys);
		for (const each of mappingKey) {
			const existingKeysStr = JSON.stringify(each.keys);
			if (existingKeysStr === stringArray) {
				mappingKey.delete(each);
				return true;
			}
		}

		return false;
	}

	/**
	 * Remove all mapping key entries whose head key matches `firstKey`.
	 * @returns `true` if any entries were removed, `false` otherwise.
	 */
	removeMapping(firstKey: string) {
		return this.mapping.delete(firstKey);
	}

	/**
	 * Subscribe to composition state changes. The callback fires whenever the
	 * chain starts, advances, breaks, completes, or is undone. Use it to
	 * trigger a framework re-render (e.g. React `useState` setter).
	 *
	 * @returns An unsubscribe function.
	 */
	subscribe(fn: () => void): () => void {
		this.subscribers.add(fn);
		return () => {
			this.subscribers.delete(fn);
		};
	}

	/**
	 * Return the most recent {@link CompositionEvent}, or `null` if nothing
	 * has happened yet. Useful for displaying diagnostic context (e.g.
	 * "Chain started with key '3'" or "Broke on key 'x'").
	 */
	getLastEvent(): CompositionEvent | null {
		return this.lastEvent;
	}

	private notify(event: CompositionEvent): void {
		this.lastEvent = event;
		for (const fn of this.subscribers) {
			fn();
		}
	}

	/**
	 * Subscribe to mapping-key state changes. The callback fires whenever a
	 * mapping-key sequence starts, advances, breaks, is consumed
	 * (exclusive), or completes. Independent from {@link subscribe} so
	 * composition subscribers are not notified by mapping-key events.
	 *
	 * @returns An unsubscribe function.
	 */
	subscribeMapping(fn: () => void): () => void {
		this.mappingSubscribers.add(fn);
		return () => {
			this.mappingSubscribers.delete(fn);
		};
	}

	/**
	 * Return the most recent {@link MappingKeyEvent}, or `null` if no
	 * mapping-key event has happened yet.
	 */
	getLastMappingEvent(): MappingKeyEvent | null {
		return this.lastMappingEvent;
	}

	private notifyMapping(event: MappingKeyEvent): void {
		this.lastMappingEvent = event;
		for (const fn of this.mappingSubscribers) {
			fn();
		}
	}

	/**
	 * Record the normalized key names of the current event for matching
	 * against registered composition and mapping keys.
	 */
	synchronizingKey(eventName: string[]) {
		this.currentKey = eventName;
	}

	/**
	 * Register a composition key entry. Semantically equivalent duplicates
	 * (same fingerprint) are skipped.
	 *
	 * Each entry is a node in a composition chain: when the entry's `key`
	 * is pressed, the engine either continues the pending chain (if the
	 * entry's `needs` are satisfied by the preceding `lastFlag`) or starts
	 * a new chain (if the entry is a head key — `optional: true` or empty
	 * `needs`). Multiple entries can share the same `key` name; they are
	 * stored in a `Map<string, Set<CompositionKey>>` (duplicate identities
	 * are not added twice) and the best match is resolved at runtime via
	 * {@link resolveCompositionKey}.
	 *
	 * @example
	 * ```ts
	 * engine.registryCompositionKey({
	 *   key: '3',
	 *   alternativeFlag: 'times',
	 *   needs: [],
	 *   optional: true,
	 *   execute: (ctx) => ({
	 *     value: 3,
	 *     lastFlag: 'times',
	 *     steps: [...ctx.steps, '3'],
	 *   }),
	 * });
	 *
	 * engine.registryCompositionKey({
	 *   key: '3',
	 *   alternativeFlag: 'action',
	 *   needs: ['times'],
	 *   execute: (ctx) => {
	 *     const count = ctx.value as number;
	 *     // Fire the compound action after the first timed press
	 *     console.log(`Repeated ${count} times`);
	 *     return null; // End the chain
	 *   },
	 * });
	 * ```
	 */
	registryCompositionKey(entry: CompositionKey<TComponent>) {
		const key = entry.key;
		const set = this.keyMappingTable.get(key);

		if (!set) {
			this.keyMappingTable.set(key, new Set([entry]));
			return;
		}

		// Skip if a semantically equivalent entry already exists.
		// Fingerprint excludes callbacks (execute / undoAction / when)
		// because those are new references on every React render and
		// don't define the entry's identity in the chain.
		const fp = compositionFingerprint(entry);
		for (const existing of set) {
			if (compositionFingerprint(existing) === fp) return;
		}

		set.add(entry);
	}

	/**
	 * Remove all entries registered under `key` — the entire set is deleted
	 * from the mapping table.
	 *
	 * Does NOT cancel an active pending chain: if a chain is pending when
	 * its entries are removed, it continues with its already-started
	 * context until the timeout expires. Call {@link abort} to cancel it.
	 *
	 * @returns `true` if an entry was removed, `false` if none existed.
	 */
	removeCompositionKey(key: string): boolean {
		return this.keyMappingTable.delete(key);
	}

	/**
	 * Remove every registered composition key (clears the entire mapping
	 * table). Does not cancel an active pending chain — see
	 * {@link removeCompositionKey}.
	 */
	clearAllCompositionKeys(): void {
		this.keyMappingTable.clear();
	}

	/**
	 * Whether the engine currently has an active pending chain.
	 *
	 * A chain is "pending" from the moment the first key starts it until it
	 * completes naturally, a key is pressed with no matching entry, or the
	 * timeout expires.
	 */
	hasPending(): boolean {
		return this.pendingEntry !== null;
	}

	/**
	 * Return a copy of the current composition context — the chain's
	 * accumulated `value`, `lastFlag`, and `steps` history.
	 *
	 * The copy is shallow: the `steps` array is a fresh array copy, but
	 * `value` is a reference (not deep-cloned), and modifying the returned
	 * object does not affect the engine's internal state.
	 */
	getContext(): CompositionContext {
		return { ...this.context, steps: [...this.context.steps] };
	}

	/**
	 * Cancel the current pending chain immediately (no timeout).
	 *
	 * Clears the pending timer (no stale timeout callback will fire),
	 * resets the context to `{ value: undefined, lastFlag: null, steps: [] }`,
	 * and sets the engine's `compositionEngineHandle` flag to `false` so
	 * pipeline processors stop treating the chain as pending. A pending
	 * mapping sequence is cancelled too — callers reach for `abort()` to
	 * drop the user's unfinished input, and a half-typed mapping prefix is
	 * part of it. No-op when nothing is pending.
	 */
	abort(): void {
		this.recordHistory();
		this.cancelMappingPending();
		this.clearPending();
		this.notify({ type: "aborted" });
	}

	/**
	 * Undo one or more completed composition sequences.
	 *
	 * Each completed chain is stored as a separate entry in the undo buffer.
	 * Passing `steps` undoes that many sequences, executing every key's
	 * {@link CompositionKey#undoAction} in reverse order.
	 *
	 * @param steps - Number of past sequences to undo. Defaults to 1.
	 *   When `options.byKey` is `true`, `steps` counts individual keys instead.
	 * @param options.isolated - When `true`, each sequence's undo starts from
	 *   its own saved context — ctx does NOT propagate across sequences.
	 *   Defaults to `false` (flat propagation).
	 * @param options.byKey - When `true`, `steps` counts individual keys
	 *   instead of whole sequences. Orthogonal to `isolated`.
	 *   Defaults to `false`.
	 * @returns The final context after all undo actions, or `null` if
	 *   nothing was undone.
	 * @throws If `steps` exceeds the number of buffered sequences (or keys,
	 *   when `byKey` is `true`).
	 *
	 * @example Flat mode (default)
	 * ```ts
	 * engine.undo(2);
	 * ```
	 *
	 * @example Isolated mode
	 * ```ts
	 * engine.undo(2, { isolated: true });
	 * ```
	 *
	 * @example By-key mode
	 * ```ts
	 * engine.undo(3, { byKey: true });  // undo 3 keys, not 3 sequences
	 * ```
	 */
	undo(
		steps: number = 1,
		options?: { isolated?: boolean; byKey?: boolean },
	): CompositionContext | null {
		// Cancel any in-flight composition before undoing. Leaving a pending
		// chain (or pending mapping sequence) alive would keep startPending()
		// from beginning a new chain until the stale timeout fires.
		this.clearPending();
		this.cancelMappingPending();

		if (this.buffers.length === 0) return null;

		const byKey = options?.byKey === true;
		const isolated = options?.isolated === true;

		if (byKey) {
			return this.undoByKey(steps, isolated);
		}

		if (steps > this.buffers.length) {
			throw new Error(
				`[keyboard-engine] Cannot undo ${steps} sequence(s): only ` +
					`${this.buffers.length} buffered.`,
			);
		}

		const start = this.buffers.length - steps;
		const undone = this.buffers.slice(start);
		let currentCtx: CompositionContext | null = null;
		// Entries are processed newest-first, so the successfully-undone ones
		// are always a suffix of the flattened buffer. Counting them lets us
		// remove exactly what was undone — a sequence whose `undoAction`
		// returns `null` (stopping the walk) must stay in the buffers.
		let undoneEntries = 0;

		if (isolated) {
			for (let i = undone.length - 1; i >= 0; i--) {
				const seq = [...undone[i]].reverse();
				let seqCtx: CompositionContext = seq[0].ctx;
				let stopped = false;

				for (const buffer of seq) {
					const nextCtx = this.processUndoEntry(buffer, seqCtx);
					if (nextCtx === null) {
						stopped = true;
						break;
					}
					seqCtx = nextCtx;
					undoneEntries++;
				}

				if (stopped) break;
				currentCtx = seqCtx;
			}
		} else {
			const allEntries = undone.flat().reverse();
			if (allEntries.length === 0) return null;

			currentCtx = allEntries[0].ctx;

			for (const buffer of allEntries) {
				const nextCtx = this.processUndoEntry(buffer, currentCtx);
				if (nextCtx === null) break;
				currentCtx = nextCtx;
				undoneEntries++;
			}
		}

		// Remove exactly what was undone before the early return: isolated
		// mode can stop partway through the newest sequence, so entries may
		// have run even though no sequence completed (`currentCtx === null`).
		// Leaving them buffered would replay their undo actions next time.
		const undoneSequences = this.removeLastBufferedEntries(undoneEntries);

		if (currentCtx === null) {
			// The walk stopped before any sequence completed, but a partial
			// truncation still changed the ledger — subscribers must hear
			// about it even though the return value is `null`. `steps` is 0
			// here: no sequence was undone in full.
			if (undoneEntries > 0) {
				this.notify({ type: "undone", steps: undoneSequences });
			}
			return null;
		}

		this.context = currentCtx;
		this.state.compositionEngineHandle = false;
		// Report what was actually undone, not what was requested — a walk
		// stopped by an `undoAction` returning `null` leaves the remaining
		// sequences buffered.
		this.notify({ type: "undone", steps: undoneSequences });
		return currentCtx;
	}

	/**
	 * Remove the last `n` executed entries from the undo buffers, newest
	 * first, deleting any sequence that empties out. `n` counts individual
	 * keys, so a partially-undone sequence is truncated rather than dropped.
	 *
	 * @returns The number of sequences that were removed entirely, for the
	 *          `undone` event's payload.
	 */
	private removeLastBufferedEntries(n: number): number {
		let remaining = n;
		let removedSequences = 0;
		for (let si = this.buffers.length - 1; si >= 0 && remaining > 0; si--) {
			const seq = this.buffers[si];
			if (remaining >= seq.length) {
				remaining -= seq.length;
				this.buffers.splice(si, 1);
				removedSequences++;
			} else {
				seq.splice(seq.length - remaining, remaining);
				remaining = 0;
			}
		}
		return removedSequences;
	}

	/**
	 * Undo by individual key count. Walks buffers from the end,
	 * collecting `steps` entries across sequence boundaries.
	 */
	private undoByKey(
		steps: number,
		isolated: boolean,
	): CompositionContext | null {
		let totalKeys = 0;
		for (const seq of this.buffers) {
			totalKeys += seq.length;
		}
		if (steps > totalKeys) {
			throw new Error(
				`[keyboard-engine] Cannot undo ${steps} key(s): only ` +
					`${totalKeys} buffered.`,
			);
		}

		// Collect the last `steps` entries, tracking which sequences they came from
		const collected: {
			entry: bufferEntry;
			seqIndex: number;
			entryIndex: number;
		}[] = [];
		let remaining = steps;

		for (let si = this.buffers.length - 1; si >= 0 && remaining > 0; si--) {
			const seq = this.buffers[si];
			for (let ei = seq.length - 1; ei >= 0 && remaining > 0; ei--) {
				collected.push({ entry: seq[ei], seqIndex: si, entryIndex: ei });
				remaining--;
			}
		}

		// `collected` is in reverse chronological order (most recent first), so
		// the successfully-undone entries are always a prefix of it. Counting
		// them lets us drop exactly what was undone and leave a refused key —
		// and everything older — buffered for a later undo.
		let currentCtx: CompositionContext | null = null;
		let undoneEntries = 0;

		if (isolated) {
			// Group entries by sequence, process each sequence independently
			let seqIndex = 0;
			while (seqIndex < collected.length) {
				const seqEntries: bufferEntry[] = [];
				const groupSeqId = collected[seqIndex].seqIndex;

				while (
					seqIndex < collected.length &&
					collected[seqIndex].seqIndex === groupSeqId
				) {
					seqEntries.push(collected[seqIndex].entry);
					seqIndex++;
				}

				// Entries within a sequence are already in reverse order (most recent first)
				let seqCtx: CompositionContext = seqEntries[0].ctx;
				let stopped = false;

				for (const buffer of seqEntries) {
					const nextCtx = this.processUndoEntry(buffer, seqCtx);
					if (nextCtx === null) {
						stopped = true;
						break;
					}
					seqCtx = nextCtx;
					undoneEntries++;
				}

				if (stopped) break;
				currentCtx = seqCtx;
			}
		} else {
			// Flat mode: process all collected entries in order (already reversed).
			// An empty selection (e.g. `steps: 0`) is a no-op, not a crash.
			if (collected.length === 0) return null;
			currentCtx = collected[0].entry.ctx;

			for (const { entry } of collected) {
				const nextCtx = this.processUndoEntry(entry, currentCtx);
				if (nextCtx === null) break;
				currentCtx = nextCtx;
				undoneEntries++;
			}
		}

		// Remove exactly what was undone, mirroring the sequence-counting path.
		// Dropping every collected entry here lost a key whose `undoAction`
		// refused — its undo never ran, yet it was no longer buffered.
		this.removeLastBufferedEntries(undoneEntries);

		if (currentCtx === null) {
			if (undoneEntries > 0) {
				this.notify({ type: "undone", steps: undoneEntries });
			}
			return null;
		}

		this.context = currentCtx;
		this.state.compositionEngineHandle = false;
		// Report the individual keys actually undone, not what was requested.
		this.notify({ type: "undone", steps: undoneEntries });
		return currentCtx;
	}

	/** Number of completed sequences available for undo. */
	bufferedCount(): number {
		return this.buffers.length;
	}

	/** Clear all buffered undo history. */
	clearBuffers(): void {
		this.buffers = [];
		this.notify({ type: "cleared" });
	}

	/**
	 * Validate and execute a single undo entry.
	 * Returns the new context after the undo action, or `null` to stop the undo chain.
	 */
	private processUndoEntry(
		buffer: bufferEntry,
		currentCtx: CompositionContext,
	): CompositionContext | null {
		if (this.valueSchema && currentCtx.lastFlag) {
			const guard = this.valueSchema[currentCtx.lastFlag];
			if (guard && !guard(currentCtx.value)) {
				if (process.env.NODE_ENV !== "production") {
					console.warn(
						`[keyboard-engine] Undo key "${buffer.key}": input value ` +
							`from flag "${currentCtx.lastFlag}" failed type guard — stopping undo.`,
					);
				}
				return null;
			}
		}

		const newCtx = buffer.undoAction(currentCtx);
		if (!newCtx) {
			return null;
		}

		if (this.valueSchema && newCtx.lastFlag) {
			const guard = this.valueSchema[newCtx.lastFlag];
			if (guard && !guard(newCtx.value)) {
				if (process.env.NODE_ENV !== "production") {
					console.warn(
						`[keyboard-engine] Undo key "${buffer.key}": output value ` +
							`for flag "${newCtx.lastFlag}" failed type guard — stopping undo.`,
					);
				}
				return null;
			}
		}

		return newCtx;
	}

	private areFlagsEqual(a: Flags, b: Flags): boolean {
		if (a.length !== b.length) return false;

		for (let i = 0; i < a.length; i++) {
			if (a[i].need !== b[i].need || a[i].become !== b[i].become) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Update a registered entry identified by `key` + `flags`.
	 *
	 * The old entry is removed and a merged entry (old fields + `updates`,
	 * preserving `key` and `flags`) is re-registered. Together `key` and
	 * `flags` uniquely identify the entry (compared via `areFlagsEqual`),
	 * so entries sharing a key name can be targeted individually instead
	 * of removing all entries for that key.
	 *
	 * @returns `true` if the entry was found and updated, `false` if no
	 *          entry matched.
	 */
	updateCompositionKey(
		key: string,
		flags: Flags,
		updates: Partial<Omit<CompositionKey<TComponent>, "key" | "flags">>,
	): boolean {
		const set = this.keyMappingTable.get(key);
		if (!set) return false;

		for (const entry of set) {
			if (this.areFlagsEqual(flags, entry.flags)) {
				set.delete(entry);
				const merged: CompositionKey<TComponent> = {
					...entry,
					...updates,
					key,
					flags,
				};
				set.add(merged);
				return true;
			}
		}

		return false;
	}

	/**
	 * Validate the chain value against the guard registered for its current
	 * flag. Takes the context explicitly — a mapped chain's value lives in
	 * `runTargetChain`'s local context while it runs, so reading
	 * `this.context` here would check the engine's idle value instead.
	 */
	private validateInput(currentCtx: CompositionContext, entryKey: string): boolean {
		if (!this.valueSchema || !currentCtx.lastFlag) return true;
		const guard = this.valueSchema[currentCtx.lastFlag];
		if (!guard) return true;
		if (!guard(currentCtx.value)) {
			if (process.env.NODE_ENV !== "production") {
				console.warn(
					`[keyboard-engine] Composition key "${entryKey}": input value from flag ` +
						`"${currentCtx.lastFlag}" failed type guard — clearing pending chain.`,
				);
			}
			return false;
		}
		return true;
	}

	private validateOutput(
		flag: string,
		value: unknown,
		entryKey: string,
	): boolean {
		if (!this.valueSchema) return true;
		const guard = this.valueSchema[flag];
		if (!guard) return true;
		if (!guard(value)) {
			if (process.env.NODE_ENV !== "production") {
				console.warn(
					`[keyboard-engine] Composition key "${entryKey}" (flag: "${flag}") ` +
						`produced a value that failed its type guard.`,
				);
			}
			return false;
		}
		return true;
	}

	private clearPending() {
		if (this.pendingEntry) {
			clearTimeout(this.pendingEntry.timer);
			this.pendingEntry = null;
		}

		this.context = { value: undefined, lastFlag: null, steps: [] };
		this.state.compositionEngineHandle = false;
	}

	private resetPendingTimer(timeout: number): void {
		if (!this.pendingEntry) return;
		clearTimeout(this.pendingEntry.timer);
		const timer = setTimeout(() => {
			this.clearPending();
		}, timeout);
		this.pendingEntry.timer = timer;
		this.pendingEntry.timeout = timeout;
	}

	/**
	 * Clear the mapping-key pending state: cancel its timer and reset the
	 * composition-engine handle flag. Mirrors {@link clearPending} but for
	 * {@link mappingPendingEntry}. Does not touch composition context.
	 */
	private clearMappingPending(): void {
		if (this.mappingPendingEntry) {
			clearTimeout(this.mappingPendingEntry.timer);
			this.mappingPendingEntry = null;
		}
		this.state.compositionEngineHandle = false;
	}

	/**
	 * Drop a pending mapping sequence and tell mapping subscribers it is
	 * gone — the counterpart of the `completed` / `broken` notifications that
	 * the other terminal paths emit. Callers that already notify about their
	 * own outcome (`completed`, `broken`, `consumed`) use
	 * {@link clearMappingPending} directly and must not route through here.
	 */
	private cancelMappingPending(): void {
		if (!this.mappingPendingEntry) return;
		this.clearMappingPending();
		this.notifyMapping({ type: "cancelled" });
	}

	/**
	 * Reset the mapping-key pending timer to a new timeout. Mirrors
	 * {@link resetPendingTimer} but for {@link mappingPendingEntry}.
	 */
	private resetMappingPendingTimer(timeout: number): void {
		if (!this.mappingPendingEntry) return;
		clearTimeout(this.mappingPendingEntry.timer);
		const timer = setTimeout(() => {
			this.cancelMappingPending();
		}, timeout);
		this.mappingPendingEntry.timer = timer;
		this.mappingPendingEntry.timeout = timeout;
	}

	/**
	 * Filter candidates by phase, mode, `when`, category, and top component,
	 * mirroring the pattern used in global-sequence / global-key processors.
	 * Applying `when` here (rather than after resolution) means a closed gate
	 * only skips its own entry — a sibling entry for the same key with an open
	 * gate can still be selected.
	 */
	private filterEntries<TComponent, T extends PrimitiveTypeKeys<TComponent>>(
		entries: T[],
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): T[] {
		return entries.filter((entry) => {
			if ((entry.affectOverlay ?? false) !== affectOverlay) return false;
			if (entry.mode && entry.mode !== ctx.currentMode) return false;
			if (!checkWhen(entry.when, ctx.conditions)) return false;
			if (!ctx.topComponent) return false;

			if (affectOverlay && ctx.allLayers.length === 0 && !entry.executeWhenNoOverlay)
				return false;

			const cat = entry.category;
			if (cat !== undefined && cat !== "*") {
				if (Array.isArray(cat) && cat.length === 0) return false;
				if (Array.isArray(cat) && !cat.includes(ctx.topComponent)) return false;
			}

			return true;
		});
	}

	private chooseFlag(
		lastFlag: string | null,
		flags: Flags,
		alternative: string,
	): string {
		if (!lastFlag) {
			return alternative;
		}

		for (const each of flags) {
			if (each.need === lastFlag) {
				return each.become;
			}
		}

		return alternative;
	}

	private isEndKey(neededKeysFlag: string[], lastFlag: string | null) {
		if (!lastFlag) {
			// `lastFlag` is null only for the head key. In theory that cannot
			// happen here because `isEndKey` is only called from
			// `processPending`, but keep the fallback anyway.
			return false;
		}

		return neededKeysFlag.includes(lastFlag);
	}

	private getMappingKeys() {
		return [...this.mapping.keys()];
	}

	/**
	 * Run one resolved composition key against `currentCtx`, applying the
	 * same gates a directly-typed key goes through. Shared by `processPending`
	 * (typed chains) and `runTargetChain` (mapped chains) so the two paths
	 * cannot drift: input/output value schemas, end-key detection, and
	 * automatic flag selection all behave identically. (`when` is handled
	 * earlier, in `filterEntries`, so a closed gate skips the entry and lets
	 * a sibling match instead of aborting the key.)
	 *
	 * @returns `{ ok: true, ctx }` with the transformed context, or
	 *          `{ ok: false, reason, release }`. `reason` tells the caller
	 *          whether to record history (`"terminate"` / `"endkey"` do;
	 *          the rest do not); `release` mirrors
	 *          {@link CompositionKey.KeyReleaseWhenChainInterrupted} —
	 *          `true` swallows the breaking key, `false` releases it.
	 */
	private executeResolvedKey(
		result: CompositionKey<TComponent>,
		currentCtx: CompositionContext,
	): KeyOutcome {
		if (!this.validateInput(currentCtx, result.key)) {
			return {
				ok: false,
				reason: "input",
				release: result.KeyReleaseWhenChainInterrupted ?? false,
			};
		}

		const nextCtx = result.execute?.(currentCtx);
		if (!nextCtx) {
			return {
				ok: false,
				reason: "terminate",
				release: result.KeyReleaseWhenChainInterrupted ?? false,
			};
		}

		// A user returning `null` from `execute` could simulate an end key
		// under specific circumstances, but we prefer to respect the user's
		// choice — the end-key check therefore runs after the
		// context-null check.
		if (this.isEndKey(result.isEndKey ?? [], currentCtx.lastFlag)) {
			return {
				ok: false,
				reason: "endkey",
				release: result.KeyReleaseWhenChainInterrupted ?? false,
			};
		}

		if (!nextCtx.lastFlag) {
			// When the user leaves `lastFlag` null, the flag is assigned
			// automatically — the user always keeps control. `chooseFlag`
			// honours the declared `flags` transition; `alternativeFlag` is
			// only the fallback.
			nextCtx.lastFlag = this.chooseFlag(
				currentCtx.lastFlag,
				result.flags,
				result.alternativeFlag,
			);
		}

		if (!this.validateOutput(nextCtx.lastFlag, nextCtx.value, result.key)) {
			return {
				ok: false,
				reason: "output",
				release: result.KeyReleaseWhenChainInterrupted ?? false,
			};
		}

		return { ok: true, ctx: nextCtx };
	}

	/**
	 * Execute a mapping key's `target` composition chain end-to-end.
	 *
	 * Walks `entry.target` in order, resolving each target key against
	 * `keyMappingTable` and running it through the shared
	 * {@link CompositionEngine.executeResolvedKey} helper — so a mapped key
	 * passes the same `when` / value-schema / end-key / flag-selection gates
	 * as a directly-typed one. The first iteration uses `lastFlag = null`
	 * (head of chain); subsequent iterations feed the previous step's
	 * `lastFlag` forward.
	 *
	 * On any failure (no entries after filter, resolve returns null, a gate
	 * rejects the key) the chain is interrupted. The returned `swallow` flag
	 * mirrors {@link MappingKeyEntry.KeyReleaseWhenChainInterrupted}: when
	 * true, the breaking key is silently consumed rather than released to
	 * lower pipeline stages.
	 *
	 * Chains that end by design (`execute` returned `null`, or an end key
	 * matched) still hand the keys executed so far to the undo ledger, and an
	 * end key counts as completion rather than interruption — the same
	 * outcomes the typed path produces.
	 *
	 * @param entry        The locked-in mapping key candidate.
	 * @param ctx          Current pipeline context (for affectOverlay / category / mode filtering).
	 * @param affectOverlay Which pipeline phase is calling.
	 * @returns `{ ok: true }` on full success, or `{ ok: false, swallow }` on interruption.
	 */
	private runTargetChain(
		entry: MappingKeyEntry<TComponent>,
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): { ok: true } | { ok: false; swallow: boolean } {
		const target = entry.target;
		let currentCtx: CompositionContext = {
			value: undefined,
			lastFlag: null,
			steps: [],
		};
		// A mapping is an alias for its target keys, so the executed steps are
		// collected here and handed to the undo ledger on success — exactly as
		// if the user had typed the target keys themselves.
		const executed: bufferEntry[] = [];

		const interrupted: { ok: false; swallow: boolean } = {
			ok: false,
			swallow: entry.KeyReleaseWhenChainInterrupted ?? false,
		};

		for (let i = 0; i < target.length; i++) {
			const coms = [...(this.keyMappingTable.get(target[i]) ?? [])];
			const f = this.filterEntries(coms, ctx, affectOverlay);

			if (f.length === 0) {
				return interrupted;
			}

			// `currentCtx.lastFlag` is `null` for the first key (head of the
			// chain) and carries the previous step's flag afterwards.
			const result = resolveCompositionKey(f, currentCtx.lastFlag);
			if (!result) {
				return interrupted;
			}

			const outcome = this.executeResolvedKey(result, currentCtx);
			if (!outcome.ok) {
				// A chain that ends by design — an end key matched, or
				// `execute` returned `null` — records the keys executed so
				// far, exactly as typing them would; gate rejections and
				// resolve failures drop the partial chain.
				if (
					outcome.reason === "terminate" ||
					outcome.reason === "endkey"
				) {
					if (executed.length > 0) {
						this.buffers.push(executed);
					}
				}
				// An end key is the chain's declared finish line, not an
				// interruption: the mapped sequence completed.
				return outcome.reason === "endkey" ? { ok: true } : interrupted;
			}

			currentCtx = outcome.ctx;
			executed.push({
				key: result.key,
				undoAction: result.undoAction ?? ((c) => c),
				ctx: currentCtx,
			});
		}

		// An empty target would otherwise leave a zombie entry that `undo`
		// can neither replay nor splice off.
		if (executed.length > 0) {
			this.buffers.push(executed);
		}

		return { ok: true };
	}

	private tryStartMappingKeyPending(
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): MappingStartOutcome {
		const mappingKeys = this.getMappingKeys();
		const keyOfDestiny = mappingKeys.find((each) =>
			this.currentKey.includes(each),
		);

		if (!keyOfDestiny) {
			return "none";
		}

		const allCandidateKeys = this.mapping.get(keyOfDestiny);

		if (!allCandidateKeys) {
			return "none";
		}

		// `filterEntries` drops entries whose `when` gate is closed; when none
		// remain the mapping does not apply to this key, so it returns "none"
		// and leaves the bare key free for the composition chain and lower
		// pipeline stages — the same behaviour as globalSequence skipping a
		// `when`-gated entry.
		const filtered = this.filterEntries([...allCandidateKeys], ctx, affectOverlay);

		// Single-key mappings (keys.length === 1) are executed immediately on
		// the head key — they have no subsequent keys to wait for. When both
		// single-key and multi-key mappings share the same head key, the
		// single-key mapping wins (first one in registration order), matching
		// how globalSequence picks `matching[0]` as the selected entry.
		const singleKeyEntries = filtered.filter((e) => e.keys.length === 1);
		if (singleKeyEntries.length >= 1) {
			const locked = singleKeyEntries[0];
			this.notifyMapping({ type: "started", key: keyOfDestiny });
			const outcome = this.runTargetChain(locked, ctx, affectOverlay);
			if (!outcome.ok) {
				this.notifyMapping({ type: "broken", key: keyOfDestiny });
				// A mapping head key matched, so the event has been handled by
				// the mapping subsystem — even a released one must not fall
				// through to the composition chain, or the same physical key
				// would fire twice.
				return outcome.swallow ? "consumed" : "released";
			}
			this.notifyMapping({ type: "completed" });
			return "consumed";
		}

		// No single-key candidates — all remaining candidates need more keys.
		// If none remain, there is nothing to start.
		const multiKeyEntries = filtered.filter((e) => e.keys.length > 1);
		if (multiKeyEntries.length === 0) {
			return "none";
		}

		// Mirrors globalSequence / boundSequence: the first matching entry
		// seeds `exclusive`. In exclusive mode the selected entry is locked in
		// immediately (no disambiguation needed), so it is kept as the sole
		// candidate. In non-exclusive mode, only non-exclusive entries stay
		// as disambiguation candidates.
		const selected = multiKeyEntries[0];
		const exclusive = selected.exclusive ?? false;
		const candidates = exclusive
			? [selected]
			: multiKeyEntries.filter((c) => c.exclusive !== true);

		const pending: MappingPendingEntry<TComponent> = {
			keys: [keyOfDestiny],
			nextIndex: 1,
			timeout: selected.timeout ?? this.defaultTimeout,
			timer: undefined as unknown as NodeJS.Timeout,
			exclusive,
			affectOverlay,
			candidates,
			when: selected.when,
		};

		const timer = setTimeout(() => {
			this.cancelMappingPending();
		}, pending.timeout);
		pending.timer = timer;
		this.mappingPendingEntry = pending;
		this.state.compositionEngineHandle = true;
		this.notifyMapping({ type: "started", key: keyOfDestiny });

		return "consumed";
	}

	/**
	 * Narrow a list of mapping-key candidates by checking which ones have
	 * a key at `nextIndex` that matches the user's current input.
	 *
	 * Used while a {@link MappingPendingEntry} is in progress and the user
	 * presses the next key. When multiple candidates share the same head
	 * key but diverge later, this filters out the ones whose next segment
	 * does not match, progressively resolving the ambiguity.
	 *
	 * @param candidates   The current candidate pool (from `mappingPendingEntry.candidates`).
	 * @param nextIndex    The index within each candidate's `keys` array to check against.
	 * @param currentKey   The single key name the user just pressed (e.g. `"s"` or `"ctrl+s"`).
	 * @returns The narrowed candidate list. May be empty (no candidate matches —
	 *          sequence is broken), length 1 (locked in), or still > 1 (ambiguous,
	 *          needs further narrowing on the next key).
	 */
	private disambiguateMappingCandidates(
		candidates: MappingKeyEntry<TComponent>[],
		nextIndex: number,
		currentKey: string,
	): MappingKeyEntry<TComponent>[] {
		if (candidates.length <= 1) return candidates;
		return candidates.filter((entry) => entry.keys[nextIndex] === currentKey);
	}

	/**
	 * Advance or complete an in-progress mapping-key pending sequence.
	 *
	 * Called on every key event while {@link mappingPendingEntry} is set.
	 * Resolves the user's current input against the registered mapping
	 * keys, narrows the candidate pool, and either:
	 *   - locks in a single candidate and runs its target chain,
	 *   - keeps narrowing when still ambiguous, or
	 *   - breaks the sequence (honoring exclusive / swallow semantics).
	 *
	 * @returns `true` if the key was consumed by the mapping subsystem,
	 *          `false` to let it fall through to lower pipeline stages.
	 */
	private processMappingKeyPending(
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): boolean {
		if (!this.mappingPendingEntry) return false;
		// Phase guard — a pending started in the layer phase must not be
		// advanced by the page-phase processor (and vice versa). Mirrors
		// processPending / globalSequence pending handling.
		if (this.mappingPendingEntry.affectOverlay !== affectOverlay) return false;

		clearTimeout(this.mappingPendingEntry.timer);

		const pending = this.mappingPendingEntry;

		// Re-evaluate the gate on every key, mirroring globalSequence: a
		// sequence started while its condition held must not keep matching
		// after the condition flips to false.
		if (!checkWhen(pending.when, ctx.conditions)) {
			this.clearMappingPending();
			this.notifyMapping({ type: "broken", key: this.currentKey[0] ?? "" });
			return false;
		}

		// Determine the current input key name. Unlike tryStartMappingKeyPending
		// (which looks up registered mapping head keys), here we need to match
		// against the candidates' keys[nextIndex]. We try each name in
		// eventNames and pick the first one that appears in some candidate's
		// next segment. If none match, the key is unrelated to the sequence.
		const nextIndex = pending.nextIndex;
		let matchedKey: string | null = null;
		for (const name of this.currentKey) {
			if (pending.candidates.some((c) => c.keys[nextIndex] === name)) {
				matchedKey = name;
				break;
			}
		}

		// No candidate's next segment matches any current eventName — the user
		// pressed something unrelated. In exclusive mode the key is silently
		// consumed and the sequence keeps waiting; otherwise the pending is
		// cleared and the key is released to lower pipeline stages.
		if (matchedKey === null) {
			if (pending.exclusive) {
				this.resetMappingPendingTimer(pending.timeout);
				this.notifyMapping({ type: "consumed", key: this.currentKey[0] ?? "" });
				return true;
			}
			this.clearMappingPending();
			this.notifyMapping({ type: "broken", key: this.currentKey[0] ?? "" });
			return false;
		}

		const narrowed = this.disambiguateMappingCandidates(
			pending.candidates,
			nextIndex,
			matchedKey,
		);

		if (narrowed.length === 0) {
			// Should not happen given the matchedKey check above, but guard anyway.
			if (pending.exclusive) {
				this.resetMappingPendingTimer(pending.timeout);
				this.notifyMapping({ type: "consumed", key: this.currentKey[0] ?? "" });
				return true;
			}
			this.clearMappingPending();
			this.notifyMapping({ type: "broken", key: this.currentKey[0] ?? "" });
			return false;
		}

		if (narrowed.length > 1) {
			// Still ambiguous — record progress and keep waiting for the next key.
			pending.candidates = narrowed;
			pending.nextIndex++;
			this.resetMappingPendingTimer(pending.timeout);
			this.notifyMapping({ type: "continued", key: matchedKey });
			return true;
		}

		// Locked in to a single candidate. But the sequence may not be over yet —
		// only run the target chain when the current key is the last segment.
		const locked = narrowed[0];
		// The locked entry may differ from the one that seeded the sequence;
		// adopt its gate so the remaining checks and the completion run use it.
		pending.when = locked.when;
		if (!checkWhen(pending.when, ctx.conditions)) {
			this.clearMappingPending();
			this.notifyMapping({ type: "broken", key: matchedKey });
			return false;
		}
		if (locked.keys.length > nextIndex + 1) {
			// More keys expected — advance and keep waiting, no longer ambiguous.
			pending.candidates = narrowed;
			pending.nextIndex++;
			// Re-seed from the entry we locked onto, mirroring globalSequence:
			// disambiguation may pick a candidate other than the one that
			// started the sequence, and its own timeout should apply from here.
			pending.timeout = locked.timeout ?? this.defaultTimeout;
			this.resetMappingPendingTimer(pending.timeout);
			this.notifyMapping({ type: "continued", key: matchedKey });
			return true;
		}

		// Sequence complete — run the target composition chain end-to-end.
		const outcome = this.runTargetChain(locked, ctx, affectOverlay);
		if (outcome.ok) {
			this.clearMappingPending();
			this.notifyMapping({ type: "completed" });
			return true;
		}

		// Chain interrupted — clear pending and decide whether to swallow the key.
		this.clearMappingPending();
		this.notifyMapping({ type: "broken", key: this.currentKey[0] ?? "" });
		return outcome.swallow;
	}

	private startPending(
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): boolean {
		// Only one of the mapped-key sequence and the composition chain may
		// exist at a time, so do not start a new one while either is pending.
		if (this.pendingEntry || this.mappingPendingEntry) return false;
		this.historyKeys = [];

		const map = this.tryStartMappingKeyPending(ctx, affectOverlay);
		// `"consumed"` — the mapping handled the key; `"released"` — a mapping
		// head key matched but its target chain broke and chose to release the
		// key. Either way the composition chain must not also handle the same
		// key. Only `"none"` (no mapping applied) falls through. The call order
		// gives mapped keys precedence over standard key combinations.
		if (map === "consumed") {
			return true;
		}
		if (map === "released") {
			return false;
		}

		const allEntries = this.currentKey.flatMap((name) => [
			...(this.keyMappingTable.get(name) ?? []),
		]);
		const filtered = this.filterEntries(allEntries, ctx, affectOverlay);
		const result = resolveCompositionKey(filtered, null);

		if (!result) return false;

		const initialCtx: CompositionContext = {
			value: undefined,
			lastFlag: null,
			steps: [],
		};

		const nextCtx = result.execute?.(initialCtx);
		// `execute` returns null → chain does not start
		if (!nextCtx) return false;

		if (!nextCtx.lastFlag) {
			// When the user leaves `lastFlag` null, the flag is assigned
			// automatically — the user always keeps control.
			nextCtx.lastFlag = result.alternativeFlag;
		}

		// The candidate keys are not passed into `result` directly — they are
		// taken from the context provided by the user.
		if (!this.validateOutput(nextCtx.lastFlag, nextCtx.value, result.key)) {
			return false;
		}

		// NOTE: Since this is the start of the sequence key, we do not check the endKey.
		this.context = nextCtx;
		this.state.compositionEngineHandle = true;

		const pending: CompositionPending = {
			timeout: result.timeout ?? this.defaultTimeout,
			timer: undefined as unknown as ReturnType<typeof setTimeout>,
			exclusive: result.exclusive ?? false,
			affectOverlay,
		};

		const timer = setTimeout(() => {
			this.clearPending();

			this.recordHistory();
			this.notify({ type: "completed" });
		}, pending.timeout);

		pending.timer = timer;
		this.pendingEntry = pending;
		this.historyKeys.push({
			key: result.key,
			undoAction: result.undoAction ?? ((ctx) => ctx),
			ctx: this.context,
		});
		this.notify({ type: "started", key: result.key });
		return true;
	}

	private processPending(
		ctx: PipelineContext<TComponent>,
		affectOverlay: boolean,
	): boolean {
		// Mapping-key pending takes priority over composition pending,
		// mirroring how tryStartMappingKeyPending takes priority over
		// single-key composition in startPending.
		if (this.processMappingKeyPending(ctx, affectOverlay)) return true;

		if (!this.pendingEntry) return false;
		if (this.pendingEntry.affectOverlay !== affectOverlay) return false;

		clearTimeout(this.pendingEntry.timer);

		const allEntries = this.currentKey.flatMap((name) => [
			...(this.keyMappingTable.get(name) ?? []),
		]);
		const filtered = this.filterEntries(allEntries, ctx, affectOverlay);
		const result = resolveCompositionKey(filtered, this.context.lastFlag);

		if (result) {
			const outcome = this.executeResolvedKey(result, this.context);
			if (!outcome.ok) {
				// A rejected key is not part of the chain: like a broken match
				// or a failed value guard, it drops the partial chain without
				// recording it. Only chains that reach a terminal state
				// (timeout, end key, `execute` returning null, or an explicit
				// abort) are undoable.
				const terminal =
					outcome.reason === "terminate" || outcome.reason === "endkey";
				if (terminal) {
					this.recordHistory();
				}
				this.clearPending();
				// Subscribers must hear the chain end either way: a terminal
				// state emits `completed`, a gate rejection emits `broken` —
				// the same event a no-match break emits below.
				this.notify(
					terminal
						? { type: "completed" }
						: { type: "broken", key: this.currentKey[0] ?? result.key },
				);
				return outcome.release;
			}

			const nextCtx = outcome.ctx;
			this.context = nextCtx;

			const timeout = result.timeout ?? this.defaultTimeout;
			this.pendingEntry.timeout = timeout;
			this.pendingEntry.exclusive = result.exclusive ?? false;
			this.pendingEntry.affectOverlay = affectOverlay;

			const timer = setTimeout(() => {
				this.clearPending();

				// Why a buffer at all? Without one, only `historyKeys` could be
				// manipulated — and it is cleared at the start of each sequence
				// to avoid confusion. That clearing would erase the previous
				// sequence's history and make undo impossible mid-sequence. The
				// buffer records the history keys before each cleanup.
				this.recordHistory();
				this.notify({ type: "completed" });
			}, timeout);
			this.historyKeys.push({
				key: result.key,
				undoAction: result.undoAction ?? ((ctx) => ctx),
				ctx: this.context,
			});
			this.pendingEntry.timer = timer;

			this.notify({ type: "continued", key: result.key });
			return true;
		}

		// No match — check exclusive on the pending chain
		if (this.pendingEntry.exclusive) {
			// Silently consume, keep waiting
			this.resetPendingTimer(this.pendingEntry.timeout);
			this.notify({ type: "consumed", key: this.currentKey[0] ?? "" });
			return true;
		}

		// Not exclusive — clear and let key fall through
		this.clearPending();
		this.notify({ type: "broken", key: this.currentKey[0] ?? "" });
		return false;
	}

	/**
	 * Process a key event through the composition subsystem: first advance an
	 * in-progress pending chain, then attempt to start a new chain.
	 *
	 * @param ctx           The current pipeline context.
	 * @param affectOverlay Whether the calling pipeline phase is overlay mode.
	 * @returns `true` if the key was consumed by the composition subsystem.
	 */
	start(ctx: PipelineContext<TComponent>, affectOverlay: boolean): boolean {
		this.synchronizingKey(ctx.eventNames);
		if (this.processPending(ctx, affectOverlay)) return true;
		return this.startPending(ctx, affectOverlay);
	}

	private recordHistory() {
		if (this.historyKeys.length > 0) {
			this.buffers.push([...this.historyKeys]);
			// Reset after recording: `historyKeys` is the *current* sequence's
			// history. Leaving it populated makes every later recordHistory call
			// (a timeout callback, or an `abort()` with no chain pending) push
			// the same entries again.
			this.historyKeys = [];
		}
	}
}
