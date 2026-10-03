/**
 * Shared focus-group wiring for the editor's two panes.
 *
 * The editor and the file tree live on the SAME owner (the editor screen — the
 * tree is rendered inline, not as a layer), so they can share one named focus
 * group. Focus within a group is mutually exclusive, which is what keeps the
 * two panes from both receiving keys at once.
 */
import { useEffect, useState } from "react";
import { getEngine, subscribeFocus, useScreenSystem } from "ink-cartridge";

export const PANE_GROUP = "panes";
export const EDITOR_PANE = "editor";
export const TREE_PANE = "tree";

/** Minimal shape of a keyboard layer's active focus entries. */
type FocusEntries = {
	currentFocusIds: ReadonlyArray<{ id: string; fromGroup: unknown }>;
};

/**
 * Whether `id` is the active target of the {@link PANE_GROUP} on `layer`.
 * Compares the id and group directly (bypassing the engine's owner stack,
 * which other mounted layers can skew).
 */
export function paneIsActive(
	layer: FocusEntries | undefined,
	id: string
): boolean {
	return (
		!!layer &&
		layer.currentFocusIds.some(
			(c) => c.fromGroup === PANE_GROUP && c.id === id
		)
	);
}

/**
 * Reactively track whether `id` is the active pane of the current screen's
 * "panes" group. The page layer is read by component (the owner stack is skewed
 * by sibling layers such as the toolbar).
 */
export function usePaneActive(id: string): boolean {
	const { currentPath } = useScreenSystem();
	const pageComponent = currentPath[currentPath.length - 1]?.component;
	const [active, setActive] = useState(false);
	useEffect(() => {
		const read = () => {
			const layer = pageComponent ? getEngine().readLayer(pageComponent) : undefined;
			setActive(paneIsActive(layer, id));
		};
		read();
		return subscribeFocus(read);
	}, [pageComponent, id]);
	return active;
}
