import { isNormalCharacter } from "./isNormalCharacter.js";
import { checkWhen } from "./checkWhen.js";
import { KeyRule } from "./types/key-rule.js";
import { BaseBoundKeyEntry, PageBoundKeyEntry } from "./types/binding.js";
import { PageKeyboardLayer } from "./types/page-layer.js";
import { defaultTargetsSymbol } from "./types/default-targets-symbol.js";
import { PageFocusTarget } from "./types/focus.js";
import { PendingSequence } from "./types/pending-sequence.js";
import { PipelineContext } from "./types/processor.js";

const DEFAULT_SEQUENCE_TIMEOUT = 500;

/**
 * Check whether a normalized key name is covered by a list of key rules.
 *
 * A key is covered when any rule's key matches, AND the rule either has no
 * `when` condition or the condition evaluates to `true`. When all matching
 * rules have `when` returning `false`, the key is NOT covered.
 */
export function keyMatchesRule(
	keyName: string,
	rules: KeyRule[],
	conditions: Map<string, boolean>,
): boolean {
	for (const rule of rules) {
		if (rule.key === keyName) {
			if (checkWhen(rule.when, conditions)) return true;
		}
	}
	return false;
}

/**
 * Iterate through a list of bindings and fire the first matching handler.
 *
 * Matches exact key names first, then falls back to the wildcard `"*"` binding
 * for normal character input (see {@link isNormalCharacter}).
 *
 * A binding fires only when ALL of the following are satisfied (AND relationship):
 *   1. `skipBinding` returns `false` / absent (covers `stopsWorkingAfterLayerAppearing`)
 *   2. `when` returns `true` / absent (covers conditional enablement)
 *   3. Key name matches one in `binding.keys`
 *
 * The short-circuit evaluation order is skipBinding → when → keyMatch.
 * This order does NOT create priority among the conditions — they are
 * logical AND peers. Whether skipBinding is checked before or after when,
 * all must pass for the binding to fire.
 *
 * @param bindings      Ordered list of key bindings to try.
 * @param availableKeys Normalized key names available for matching at this layer.
 * @param input         Raw character from the framework's keyboard event.
 * @param key           Full Key descriptor from the framework.
 * @param skipBinding   Optional predicate to skip individual bindings
 *                      (used for `stopsWorkingAfterLayerAppearing` enforcement).
 * @returns `true` if a binding matched and consumed the event.
 */
export function tryMatchBindings<T extends BaseBoundKeyEntry>(
	bindings: T[],
	currentMode: string | null,
	availableKeys: string[],
	input: string,
	key: unknown,
	conditions: Map<string, boolean>,
	isNormalChar: (key: unknown) => boolean,
	skipBinding?: (binding: T) => boolean,
): boolean {
	if (availableKeys.length === 0) return false;

	for (const binding of bindings) {
		if (binding.mode && binding.mode !== currentMode) continue;
		if (skipBinding && skipBinding(binding)) continue;

		if (!checkWhen(binding.when, conditions)) continue;
		if (binding.keys.some((k) => availableKeys.includes(k))) {
			binding.handler(input, key);
			return true;
		}
	}

	const wildcardBinding = bindings.find((b) => b.keys.includes("*"));
	if (wildcardBinding && isNormalCharacter(input, key, isNormalChar)) {
		if (!skipBinding || !skipBinding(wildcardBinding)) {
			if (wildcardBinding.mode && wildcardBinding.mode !== currentMode)
				return false;
			if (!checkWhen(wildcardBinding.when, conditions)) return false;
			wildcardBinding.handler(input, key);
			return true;
		}
	}

	return false;
}

/**
 * Built-in Tab / Shift+Tab focus rotation for a given layer.
 *
 * Cycles {@link PageKeyboardLayer.currentFocusIds} through the page layer's
 * {@link PageKeyboardLayer.defaultFocusOrder} list (Tab forward, Shift+Tab backward).
 * Wraps around at both ends.
 *
 * @returns `true` if a tab event was handled and focus was moved.
 */
export function handleTabNavigation(
	layer: PageKeyboardLayer,
	eventNames: string[],
	shift: boolean,
	notifyFocusChange: () => void,
): boolean {
	if (!eventNames.includes("tab") || layer.defaultFocusOrder.length === 0)
		return false;

	let current: string | null = null;
	for (const each of layer.currentFocusIds) {
		if (each.fromGroup === defaultTargetsSymbol) {
			current = each.id;
			break;
		}
	}
	let idx = current ? layer.defaultFocusOrder.indexOf(current) : -1;
	if (shift) {
		idx = idx <= 0 ? layer.defaultFocusOrder.length - 1 : idx - 1;
	} else {
		idx = (idx + 1) % layer.defaultFocusOrder.length;
	}

	if (current) {
		const currentIdx = layer.currentFocusIds.findIndex((each) => {
			return each.fromGroup === defaultTargetsSymbol;
		});

		// If `current` is not null, `currentIdx` should never be -1 — but
		// defensive code throws rather than trusting the theory.
		if (currentIdx === -1) {
			throw new Error(
				`[ink-cartridge] [Unknown Reason] ${current} focus is missing for an unknown reason`,
			);
		}

		layer.currentFocusIds.splice(currentIdx, 1);
	}

	layer.currentFocusIds.push({
		id: layer.defaultFocusOrder[idx],
		fromGroup: defaultTargetsSymbol,
	});
	notifyFocusChange();
	return true;
}

/**
 * Resolve focus entries into their registered focus targets, skipping
 * entries whose group or target is missing.
 */
export function conductFocusGroups(
	ids: {
		id: string;
		fromGroup: string | typeof defaultTargetsSymbol;
	}[],
	layer: PageKeyboardLayer,
) {
	const allFocusTargets: PageFocusTarget[] = [];

	for (const each of ids) {
		if (each.fromGroup === defaultTargetsSymbol) {
			const defaultFt = layer.defaultTargets.get(each.id);
			if (defaultFt) {
				allFocusTargets.push(defaultFt);
			}
			continue;
		}
		const g = layer.focusTargets.get(each.fromGroup);
		if (!g) continue;
		const result = g.map.get(each.id);
		if (!result) continue;
		allFocusTargets.push(result);
	}

	return allFocusTargets;
}

/**
 * Handle a keyboard event against a single layer.
 *
 * Evaluates, in that order: tab navigation (only when `autoTab` is
 * `true`), penetration keys, wildcard priority, sequence matching,
 * focus-target bindings, layer-level bindings, and stopped keys.
 *
 * When `autoTab` is `false` (the default), Tab / Shift+Tab pass through
 * to normal bindings instead of triggering automatic focus rotation —
 * developers can then bind Tab to custom handlers.
 *
 * This is the core routing function: framework adapters that want to
 * reuse the built-in layer dispatch logic should call `handleLayer`
 * rather than re-implementing the evaluation order.
 *
 * @returns true if the event was consumed by this layer.
 */
export function handleLayer<TC>(
	ctx: PipelineContext<TC>,
	layer: PageKeyboardLayer,
	isTop: boolean,
): boolean {
	// Auto Tab navigation: only when the developer explicitly opts in via
	// autoTab: true. Otherwise Tab/Shift+Tab passes through to normal
	// bindings so developers can bind them to custom handlers.
	const shift = ctx.eventNames.some((n) => n.startsWith("shift+"));
	if (
		ctx.autoTab &&
		isTop &&
		handleTabNavigation(layer, ctx.eventNames, shift, ctx.notifyFocusChange)
	)
		return true;

	const penetrated = layer.penetrationKeys;
	const available = ctx.eventNames.filter(
		(n) => !keyMatchesRule(n, penetrated, ctx.conditions),
	);

	// stopsWorkingAfterLayerAppearing applies only to page bindings:
	// when any layer or modal layer is present, the page binding is skipped.
	const shouldSkipOnlyLayer = (b: PageBoundKeyEntry): boolean => {
		if (!b.stopsWorkingAfterLayerAppearing) return false
		return  ctx.allLayers.length > 0 || ctx.allModalLayers.length > 0;
	};

	// Wildcard priority pre-check: when enabled, wildcard `*` bindings
	// are evaluated before sequences, exact matches, and everything else.
	// Only normal characters are affected — special keys fall through.
	if (isTop && ctx.wildcardFirst && available.length > 0) {
		// Check focus-target wildcard first
		if (layer.currentFocusIds.length > 0) {
			const allFocusTargets = conductFocusGroups(
				layer.currentFocusIds,
				layer,
			);

			if (allFocusTargets.length > 0) {
				const allFPenetrated = new Set(
					allFocusTargets.flatMap((each) => each.penetrationKeys),
				);
				const fAvailable = available.filter(
					(n) => !keyMatchesRule(n, [...allFPenetrated], ctx.conditions),
				);
				if (fAvailable.length > 0) {
					const allFBindings = new Set(
						allFocusTargets.flatMap((each) => each.bindings),
					);
					const wb = [...allFBindings].find((b) => b.keys.includes("*"));
					if (wb && isNormalCharacter(ctx.input, ctx.key, ctx.isNormalChar)) {
						if (wb.mode && wb.mode !== ctx.currentMode) {
							/* skip */
						} else if (!checkWhen(wb.when, ctx.conditions)) {
							/* skip */
						} else if (!shouldSkipOnlyLayer(wb)) {
							wb.handler(ctx.input, ctx.key);
							return true;
						}
					}
				}
			}
		}
		// Check screen-level wildcard
		const wb = layer.bindings.find((b) => b.keys.includes("*"));
		if (wb && isNormalCharacter(ctx.input, ctx.key, ctx.isNormalChar)) {
			if (wb.mode && wb.mode !== ctx.currentMode) {
				/* skip */
			} else if (!checkWhen(wb.when, ctx.conditions)) {
				/* skip */
			} else if (!shouldSkipOnlyLayer(wb)) {
				wb.handler(ctx.input, ctx.key);
				return true;
			}
		}
	}

	// Sequence matching: only for the top layer (isTop).
	// Sequences have priority over ordinary boundKeyboard bindings.
	if (isTop && available.length > 0) {
		const pending = layer.pendingSequence;

		// We already have a pending sequence in progress.
		if (pending !== null) {
			// If the when condition changed to false mid-sequence, cancel
			// the pending sequence and let the key fall through to normal processing.
			if (!checkWhen(pending.when, ctx.conditions)) {
				clearTimeout(pending.timer);
				layer.pendingSequence = null;
				// Fall through to normal bindings — do NOT return true.
			} else {
				const expectedKey = pending.sequences[pending.nextIndex];
				if (available.includes(expectedKey)) {
					// Matched the next key in the sequence.
					clearTimeout(pending.timer);
					pending.nextIndex++;
					// Narrow candidates to only those whose next key also matches.
					if (pending.candidates && pending.candidates.length > 1) {
						const nextIdx = pending.nextIndex - 1;
						const narrowed = pending.candidates.filter(
							(c) =>
								c.keys.length > nextIdx && available.includes(c.keys[nextIdx]),
						);
						pending.candidates = narrowed.length <= 1 ? undefined : narrowed;
					}
					if (pending.nextIndex === pending.sequences.length) {
						// Full sequence matched — fire handler.
						pending.handler(ctx.input, ctx.key);
						layer.pendingSequence = null;
					} else {
						// Still waiting for more keys — restart the timeout.
						pending.timer = setTimeout(() => {
							if (layer.pendingSequence === pending)
								layer.pendingSequence = null;
							ctx.notifyPendingSyncs?.();
						}, pending.timeout);
					}
					return true;
				} else {
					// Mismatch.
					if (pending.options?.exclusive === true) {
						// Exclusive mode: ignore the key, keep waiting.
						return true;
					}
					if (pending.candidates && pending.candidates.length > 1) {
						// Non-exclusive with multiple candidates: try the current key
						// against every candidate's next expected key to disambiguate.
						const nextIdx = pending.nextIndex;
						const stillPossible = pending.candidates.filter(
							(c) =>
								c.keys.length > nextIdx && available.includes(c.keys[nextIdx]),
						);
						if (stillPossible.length === 0) {
							// No candidate matches — cancel all and fall through.
							clearTimeout(pending.timer);
							layer.pendingSequence = null;
						} else {
							// One or more candidates match — lock in the first match
							// and restart the sequence from it.
							const chosen = stillPossible[0];
							clearTimeout(pending.timer);
							const timeout = chosen.timeout ?? DEFAULT_SEQUENCE_TIMEOUT;
							const newSeq: PendingSequence = {
								sequences: chosen.keys,
								nextIndex: nextIdx + 1,
								handler: chosen.handler,
								timer: undefined as unknown as NodeJS.Timeout,
								timeout,
								options: chosen.options,
								when: chosen.when,
								candidates:
									stillPossible.length === 1 ? undefined : stillPossible,
							};
							if (newSeq.nextIndex === newSeq.sequences.length) {
								chosen.handler(ctx.input, ctx.key);
							} else {
								newSeq.timer = setTimeout(() => {
									if (layer.pendingSequence === newSeq)
										layer.pendingSequence = null;
									ctx.notifyPendingSyncs?.();
								}, timeout);
							}
							layer.pendingSequence = newSeq;
						}
					} else {
						// No candidates (single binding): cancel and fall through.
						clearTimeout(pending.timer);
						layer.pendingSequence = null;
					}
				}
			}
		}

		// No pending sequence — try to start a new one from the first available key.
		if (layer.pendingSequence === null) {
			// Check each available key name (not just the first) to handle
			// modifier combinations like 'ctrl+w' which appear after 'w'.
			for (const keyName of available) {
				// A bare key name (no '+') must not match while ctrl/meta is held:
				// an adapter emitting both 'd' and 'ctrl+d' for one stroke would
				// otherwise start a ['d','v'] sequence. Shift is exempt (it changes
				// the character). Inert for the shipped Ink adapter, which emits
				// only 'ctrl+d'; modifiers come from eventNames, not the raw key.
				const hasCtrlOrMeta = ctx.eventNames.some(
					(n) => n.startsWith("ctrl+") || n.startsWith("meta+"),
				);
				if (hasCtrlOrMeta && !keyName.includes("+")) {
					continue;
				}
				const candidates = layer.sequences.get(keyName);
				if (!candidates || candidates.length === 0) continue;
				// Filter by mode, stopsWorkingAfterLayerAppearing, focusId, and when constraints.
				const matching = candidates.filter((binding) => {
					if (binding.options?.mode && binding.options.mode !== ctx.currentMode)
						return false;

					if (binding.options?.stopsWorkingAfterLayerAppearing) {
						return ctx.allLayers.length === 0 && ctx.allModalLayers.length === 0;
					}

					if (binding.options?.focusId) {
						const focus = binding.options.focusId;
						if (typeof focus === "string") {
							return layer.currentFocusIds.some((eachF) => {
								if (eachF.fromGroup !== defaultTargetsSymbol) {
									return false;
								}

								return eachF.id === focus;
							});
						} else {
							return layer.currentFocusIds.some((eachF) => {
								return (
									eachF.fromGroup === focus.group && eachF.id === focus.focusId
								);
							});
						}
					}

					if (!checkWhen(binding.when, ctx.conditions)) return false;
					return true;
				});
				if (matching.length === 0) continue;
				// Pick the first match as the initial sequence state.
				const selected = matching[0];
				const timeout = selected.timeout ?? DEFAULT_SEQUENCE_TIMEOUT;
				const newSeq: PendingSequence = {
					sequences: selected.keys,
					nextIndex: 1,
					handler: selected.handler,
					timer: undefined as unknown as NodeJS.Timeout,
					timeout,
					options: selected.options,
					when: selected.when,
					// Store all matching candidates so subsequent keys can
					// disambiguate between sequences sharing the same first key.
					// In exclusive mode or when there is only one candidate, the
					// field is omitted so the mismatch path behaves as before.
					candidates:
						selected.options?.exclusive === true
							? undefined
							: (() => {
									const nonExclusive = matching.filter(
										(c) => c.options?.exclusive !== true,
									);
									return nonExclusive.length <= 1 ? undefined : nonExclusive;
								})(),
				};
				const timer = setTimeout(() => {
					if (layer.pendingSequence === newSeq) layer.pendingSequence = null;
					ctx.notifyPendingSyncs?.();
				}, timeout);
				newSeq.timer = timer;
				layer.pendingSequence = newSeq;
				return true;
			}
		}
	}

	if (isTop && layer.currentFocusIds.length > 0) {
		const allFt = conductFocusGroups(
			layer.currentFocusIds,
			layer,
		);

		if (allFt.length > 0) {
			const allBinding = [
				...new Set(
					allFt.flatMap((each) => {
						return each.bindings;
					}),
				),
			];
			const allPenetrated = [
				...new Set(
					allFt.flatMap((each) => {
						return each.penetrationKeys;
					}),
				),
			];
			const allStopped = [
				...new Set(
					allFt.flatMap((each) => {
						return each.stoppedKeys;
					}),
				),
			];

			const fAvailable = available.filter(
				(n) => !keyMatchesRule(n, allPenetrated, ctx.conditions),
			);

			if (
				tryMatchBindings(
					allBinding,
					ctx.currentMode,
					fAvailable,
					ctx.input,
					ctx.key,
					ctx.conditions,
					ctx.isNormalChar,
					shouldSkipOnlyLayer,
				)
			)
				return true;

			if (ctx.eventNames.some((n) => keyMatchesRule(n, allStopped, ctx.conditions))) {
				return true;
			}
		}
	}

	if (
		tryMatchBindings(
			layer.bindings,
			ctx.currentMode,
			available,
			ctx.input,
			ctx.key,
			ctx.conditions,
			ctx.isNormalChar,
			shouldSkipOnlyLayer,
		)
	)
		return true;

	if (
		isTop &&
		ctx.eventNames.some((n) => keyMatchesRule(n, layer.stoppedKeys, ctx.conditions))
	) {
		return true;
	}

	return false;
}
