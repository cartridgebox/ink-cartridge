import { useSyncExternalStore } from "react";

/**
 * Whether the editor page wants the file tree to hold the keyboard.
 *
 * The editor (a screen) and the tree (a layer element) sit on different
 * keyboard-engine owners, so they cannot share a focus group. The editor
 * records its intent here; the tree reconciles the engine's focus to it —
 * on mount and on every change. Reconciling (rather than a one-shot call)
 * keeps focus correct even though the keyboard handles the tree uses are not
 * referentially stable and re-run its effects.
 */
let requested = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getTreeFocusRequested(): boolean {
	return requested;
}

export function setTreeFocusRequested(next: boolean): void {
	if (requested === next) return;
	requested = next;
	for (const listener of listeners) {
		listener();
	}
}

/** Subscribe to intent changes; returns an unsubscribe function. */
export function subscribeTreeFocus(listener: () => void): () => void {
	return subscribe(listener);
}

/** Reactive binding: re-renders whenever the intent changes. */
export function useTreeFocusRequested(): boolean {
	return useSyncExternalStore(subscribe, getTreeFocusRequested, getTreeFocusRequested);
}
