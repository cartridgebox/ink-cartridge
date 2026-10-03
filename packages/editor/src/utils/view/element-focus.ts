/** Minimal shape of an element keyboard layer's active focus entries. */
type FocusableElement = {
	currentFocusIds: ReadonlyArray<{ id: string }>;
};

/**
 * Whether an element-level keyboard layer currently has `focusId` active.
 *
 * Compares the id only — the id is registered in a single focus group per
 * element here, so matching `fromGroup` against the engine's internal
 * default-group symbol would couple us to an implementation detail without
 * adding precision.
 *
 * Shared by the file tree's highlight/reconcile and its tests, so both use the
 * same condition rather than re-implementing it.
 */
export function elementHasFocus(
	element: FocusableElement | undefined,
	focusId: string
): boolean {
	return (
		!!element && element.currentFocusIds.some((c) => c.id === focusId)
	);
}
