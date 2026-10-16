import { checkWhen } from "./checkWhen.js";
import { isNormalCharacter } from "./isNormalCharacter.js";
import {
	isAutoTabEvent,
	keyMatchesRule,
	tryMatchBindings,
} from "./layerHandler.js";
import { BaseSequenceBinding } from "./types/binding.js";
import { defaultTargetsSymbol } from "./types/default-targets-symbol.js";
import { FocusTarget } from "./types/focus.js";
import {
	ElementKeyboard,
	LayerKeyboardLayer,
} from "./types/page-layer.js";
import { PendingSequence } from "./types/pending-sequence.js";
import { PipelineContext } from "./types/processor.js";

const DEFAULT_SEQUENCE_TIMEOUT = 500;

/**
 * `"sequence"` means the event was consumed by a multi-key sequence and must
 * take priority over ordinary bindings in the rest of the layer.
 */
export type ElementHandleResult = boolean | "sequence";

/**
 * Built-in Tab / Shift+Tab focus rotation for an element-level keyboard layer.
 *
 * Cycles the element's default focus order (Tab forward, Shift+Tab backward),
 * wrapping at both ends. The key names come from `ctx.autoTabKey` and its
 * `shift+` variant, so the rotation works whether or not the host's
 * `normalizeKeyNames` keeps the bare name next to the modified one.
 *
 * @returns `true` if a tab event was handled and focus was moved.
 */
export function handleTabNavigation<TC>(
	layer: ElementKeyboard,
	ctx: PipelineContext<TC>,
	shift: boolean,
): boolean {
	if (
		!isAutoTabEvent(ctx.eventNames, ctx.autoTabKey) ||
		layer.defaultFocusOrder.length === 0
	)
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
	ctx.notifyFocusChange();
	return true;
}

/**
 * Resolve the active focus targets of an element-level keyboard layer.
 */
export function collectElementFocusTargets(
	layer: ElementKeyboard,
): FocusTarget[] {
	const targets: FocusTarget[] = [];
	for (const each of layer.currentFocusIds) {
		if (each.fromGroup === defaultTargetsSymbol) {
			const target = layer.defaultTargets.get(each.id);
			if (target) targets.push(target);
			continue;
		}
		const group = layer.focusTargets.get(each.fromGroup);
		const target = group?.map.get(each.id);
		if (target) targets.push(target);
	}
	return targets;
}

function clearPending(ownerLayer: LayerKeyboardLayer): void {
	ownerLayer.pendingSequence = { fromElementId: null, pendingSequence: null };
}

function setPending(
	ownerLayer: LayerKeyboardLayer,
	elementId: string,
	pending: PendingSequence,
): void {
	ownerLayer.pendingSequence = { fromElementId: elementId, pendingSequence: pending };
}

/**
 * Handle one keyboard event against a single element inside a layer.
 *
 * This is the element-level counterpart of {@link handleLayer}. The layer
 * processor calls it for every active element of a layer, so multiple
 * elements can consume the same event (broadcast semantics inside a layer).
 *
 * `available` has already been filtered by the layer-wide penetration rules;
 * element-level and focus-target-level penetration are handled here.
 */
export function handlerElement<TC>(
	ctx: PipelineContext<TC>,
	elementId: string,
	layer: ElementKeyboard,
	ownerLayer: LayerKeyboardLayer,
	isTop: boolean,
	available: string[],
): ElementHandleResult {
	const shift = ctx.eventNames.some((n) => n.startsWith("shift+"));
	if (ctx.autoTab && isTop && handleTabNavigation(layer, ctx, shift)) {
		return true;
	}

	if (isTop && ctx.wildcardFirst && available.length > 0) {
		const focusTargets = collectElementFocusTargets(layer);
		if (focusTargets.length > 0) {
			const allPenetrated = new Set(
				focusTargets.flatMap((t) => t.penetrationKeys),
			);
			const fAvailable = available.filter(
				(n) => !keyMatchesRule(n, [...allPenetrated], ctx.conditions),
			);
			if (fAvailable.length > 0) {
				const allBindings = new Set(
					focusTargets.flatMap((t) => t.bindings),
				);
				const wildcard = [...allBindings].find((b) =>
					b.keys.includes("*"),
				);
				if (
					wildcard &&
					isNormalCharacter(ctx.input, ctx.key, ctx.isNormalChar) &&
					(!wildcard.mode || wildcard.mode === ctx.currentMode) &&
					checkWhen(wildcard.when, ctx.conditions)
				) {
					wildcard.handler(ctx.input, ctx.key);
					return true;
				}
			}
		}
		const wildcard = layer.bindings.find((b) => b.keys.includes("*"));
		if (
			wildcard &&
			isNormalCharacter(ctx.input, ctx.key, ctx.isNormalChar) &&
			(!wildcard.mode || wildcard.mode === ctx.currentMode) &&
			checkWhen(wildcard.when, ctx.conditions)
		) {
			wildcard.handler(ctx.input, ctx.key);
			return true;
		}
	}

	if (isTop && available.length > 0) {
		const pending = ownerLayer.pendingSequence.pendingSequence;
		if (pending !== null && ownerLayer.pendingSequence.fromElementId === elementId) {
			if (!checkWhen(pending.when, ctx.conditions)) {
				clearTimeout(pending.timer);
				clearPending(ownerLayer);
			} else {
				const expectedKey = pending.sequences[pending.nextIndex];
				if (available.includes(expectedKey)) {
					clearTimeout(pending.timer);
					pending.nextIndex++;
					if (pending.candidates && pending.candidates.length > 1) {
						const nextIdx = pending.nextIndex - 1;
						const narrowed = pending.candidates.filter(
							(c) =>
								c.keys.length > nextIdx &&
								available.includes(c.keys[nextIdx]),
						);
						pending.candidates =
							narrowed.length <= 1 ? undefined : narrowed;
					}
					if (pending.nextIndex === pending.sequences.length) {
						pending.handler(ctx.input, ctx.key);
						clearPending(ownerLayer);
					} else {
						pending.timer = setTimeout(() => {
							if (
								ownerLayer.pendingSequence.fromElementId === elementId &&
								ownerLayer.pendingSequence.pendingSequence === pending
							) {
								clearPending(ownerLayer);
							}
							ctx.notifyPendingSyncs?.();
						}, pending.timeout);
					}
					return "sequence";
				}

				if (pending.options?.exclusive === true) {
					return "sequence";
				}

				if (pending.candidates && pending.candidates.length > 1) {
					const nextIdx = pending.nextIndex;
					const stillPossible = pending.candidates.filter(
						(c) =>
							c.keys.length > nextIdx &&
							available.includes(c.keys[nextIdx]),
					);
					if (stillPossible.length === 0) {
						clearTimeout(pending.timer);
						clearPending(ownerLayer);
					} else {
						const chosen = stillPossible[0];
						clearTimeout(pending.timer);
						const timeout =
							chosen.timeout ?? DEFAULT_SEQUENCE_TIMEOUT;
						const newSeq: PendingSequence = {
							sequences: chosen.keys,
							nextIndex: nextIdx + 1,
							handler: chosen.handler,
							timer: undefined as unknown as NodeJS.Timeout,
							timeout,
							options: chosen.options,
							when: chosen.when,
							candidates:
								stillPossible.length === 1
									? undefined
									: stillPossible,
						};
						if (newSeq.nextIndex === newSeq.sequences.length) {
							chosen.handler(ctx.input, ctx.key);
							clearPending(ownerLayer);
						} else {
							newSeq.timer = setTimeout(() => {
								if (
									ownerLayer.pendingSequence.fromElementId === elementId &&
									ownerLayer.pendingSequence.pendingSequence === newSeq
								) {
									clearPending(ownerLayer);
								}
								ctx.notifyPendingSyncs?.();
							}, timeout);
							setPending(ownerLayer, elementId, newSeq);
						}
						return "sequence";
					}
				}

				clearTimeout(pending.timer);
				clearPending(ownerLayer);
			}
		}

		if (ownerLayer.pendingSequence.pendingSequence === null) {
			for (const keyName of available) {
				const hasCtrlOrMeta = ctx.eventNames.some(
					(n) => n.startsWith("ctrl+") || n.startsWith("meta+"),
				);
				if (hasCtrlOrMeta && !keyName.includes("+")) {
					continue;
				}
				const candidates = layer.sequences.get(keyName);
				if (!candidates || candidates.length === 0) continue;
				const matching: BaseSequenceBinding[] = candidates.filter(
					(binding) => {
						if (
							binding.options?.mode &&
							binding.options.mode !== ctx.currentMode
						) {
							return false;
						}
						if (binding.options?.focusId) {
							const focus = binding.options.focusId;
							if (typeof focus === "string") {
								return layer.currentFocusIds.some(
									(eachF) =>
										eachF.fromGroup === defaultTargetsSymbol &&
										eachF.id === focus,
								);
							}
							return layer.currentFocusIds.some(
								(eachF) =>
									eachF.fromGroup === focus.group &&
									eachF.id === focus.focusId,
							);
						}
						return checkWhen(binding.when, ctx.conditions);
					},
				);
				if (matching.length === 0) continue;

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
					candidates:
						selected.options?.exclusive === true
							? undefined
							: (() => {
									const nonExclusive = matching.filter(
										(c) => c.options?.exclusive !== true,
									);
									return nonExclusive.length <= 1
										? undefined
										: nonExclusive;
								})(),
				};
				const timer = setTimeout(() => {
					if (
						ownerLayer.pendingSequence.fromElementId === elementId &&
						ownerLayer.pendingSequence.pendingSequence === newSeq
					) {
						clearPending(ownerLayer);
					}
					ctx.notifyPendingSyncs?.();
				}, timeout);
				newSeq.timer = timer;
				setPending(ownerLayer, elementId, newSeq);
				return "sequence";
			}
		}
	}

	const focusTargets = collectElementFocusTargets(layer);
	if (focusTargets.length > 0) {
		const allBindings = [
			...new Set(focusTargets.flatMap((t) => t.bindings)),
		];
		const allPenetrated = [
			...new Set(focusTargets.flatMap((t) => t.penetrationKeys)),
		];
		const allStopped = [
			...new Set(focusTargets.flatMap((t) => t.stoppedKeys)),
		];
		const fAvailable = available.filter(
			(n) => !keyMatchesRule(n, allPenetrated, ctx.conditions),
		);
		if (
			tryMatchBindings(
				allBindings,
				ctx.currentMode,
				fAvailable,
				ctx.input,
				ctx.key,
				ctx.conditions,
				ctx.isNormalChar,
			)
		) {
			return true;
		}
		if (
			ctx.eventNames.some((n) =>
				keyMatchesRule(n, allStopped, ctx.conditions),
			)
		) {
			return true;
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
		)
	) {
		return true;
	}

	if (
		ctx.eventNames.some((n) =>
			keyMatchesRule(n, layer.stoppedKeys, ctx.conditions),
		)
	) {
		return true;
	}

	return false;
}
