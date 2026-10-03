import { defaultTargetsSymbol } from "ink-cartridge";

/** Minimal shape of an element keyboard layer's active focus entries. */
type FocusableElement = {
	currentFocusIds: ReadonlyArray<{ id: string; fromGroup: unknown }>;
};

/**
 * Whether an element-level keyboard layer currently has `focusId` active in
 * the default focus group.
 *
 * Shared by the file tree's highlight/reconcile and its tests, so the exact
 * condition (including the group check) is exercised rather than re-implemented.
 */
export function elementHasFocus(
	element: FocusableElement | undefined,
	focusId: string
): boolean {
	return (
		!!element &&
		element.currentFocusIds.some(
			(c) => c.fromGroup === defaultTargetsSymbol && c.id === focusId
		)
	);
}
