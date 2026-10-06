import React, { useReducer, useMemo, useEffect, ReactNode } from "react";
import { ScreenSystemContext, ScreenSystemContextValue } from "./context.js";
import { getTemplate, hasComponent, isChildOf, getParent } from "./registry.js";
import { ScreenAction } from "./types/actions.js";
import {
	BackFn,
	GotoScreenArgs,
	GotoScreenFn,
	SkipArgs,
	SkipFn,
} from "./types.js";
import {
	ActivateElementFn,
	ActivateElementInModalLayerFn,
	ApplyElementFn,
	ApplyElementToModalLayerFn,
	BringLayerToFrontFn,
	RestoreLayerZIndexFn,
	CloseAllLayerFn,
	CloseAllModalLayerFn,
	CloseLayerFn,
	CloseModalLayerFn,
	DeactivateElementFn,
	DeactivateElementInModalLayerFn,
	EraseElementFn,
	EraseElementInModalLayerFn,
	Layer,
	LayerOptions,
	ModalLayer,
	ModalLayerOptions,
	OpenLayerFn,
	OpenModalLayerFn,
} from "./types/layer.js";
import { LayerElement } from "./types/element.js";
import { LayerElementInput } from "./types/element.js";
import { ScreenState } from "./types/state.js";
import { Page } from "./types/page.js";

const _dispatchers = new Set<React.Dispatch<ScreenAction>>();

/**
 * Dev-only console warning. Reducer diagnostics are no-ops in production
 * builds; the duplicate open/close no-op itself must not be silenced.
 */
function warnInDev(message: string): void {
	if (process.env.NODE_ENV !== "production") {
		console.warn(message);
	}
}

/**
 * Widen screen props into the untyped action payload. The caller already
 * type-checked them against the component (see `skip`), so the assertion only
 * bridges the generic props type to the reducer's `Record<string, unknown>`.
 */
function toActionParams<C extends React.ComponentType<any>>(
	params: React.ComponentProps<C>
): Record<string, unknown> {
	return params as Record<string, unknown>;
}

/**
 * A layer element of any component type, as stored on the context value. The
 * map is heterogeneous, so a single concrete component type cannot describe
 * it — `any` is the deliberate escape hatch.
 */
type AnyLayerElementInput = LayerElementInput<any>;

/**
 * Clear all registered provider dispatchers.
 * Intended for test cleanup — prevents stale dispatch references
 * from leaking between test runs when providers are not properly
 * unmounted.
 */
export function clearDispatchers(): void {
	_dispatchers.clear();
}

function getDispatch(): React.Dispatch<ScreenAction> {
	if (_dispatchers.size === 0) {
		throw new Error(
			"[ink-cartridge] Navigation function called before Provider is mounted. Please ensure <ScenarioManagementProvider> is mounted in the component tree."
		);
	}
	return [..._dispatchers][_dispatchers.size - 1];
}

/**
 * Narrow a type-safe `LayerElementInput<C>` (props typed as `ComponentProps<C>`)
 * to the stored `LayerElement` shape (props as a plain record). The call-site
 * type safety mirrors `skip()`'s `params`; storage stays framework-agnostic.
 */
function toStoredLayerElement<C extends React.ComponentType<any>>(
	input: LayerElementInput<C>
): LayerElement {
	return {
		elementId: input.elementId,
		element: input.element,
		active: input.active,
		props: input.props as Record<string, unknown> | undefined,
	};
}

function sortLayers<T extends Layer | ModalLayer>(layers: T[]): T[] {
	return [...layers].sort((a, b) => {
		if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
		return a.createdAt - b.createdAt;
	});
}

/**
 * Navigate down the tree to a direct child of the current screen, or refresh
 * the current screen in place by passing it as the target (see
 * {@link SkipOptions.onlyAttribute}).
 */
export function skip<C extends React.ComponentType<any>>(
	component: C,
	...args: SkipArgs<C>
): void {
	if (!hasComponent(component)) {
		throw new Error(
			`[ink-cartridge] Component "${
				component.displayName || component.name || "anonymous"
			}" is not registered. Please call registerComponent() first.`
		);
	}
	const [params = {}, options] = args;
	getDispatch()({
		type: "skip",
		component,
		params: toActionParams(params),
		onlyAttribute: options?.onlyAttribute ?? false,
	});
}

/**
 * Navigate up the tree to the parent of the current screen.
 */
export function back(levels: number = 1): void {
	// `Number.isInteger` also rejects NaN and fractions: `NaN < 1` is false, and
	// a fraction would slip past the guard only for the reducer's
	// `slice(0, -levels)` to truncate it — both corrupt the path.
	if (!Number.isInteger(levels) || levels < 1) {
		throw new Error("[ink-cartridge] back() levels must be an integer >= 1.");
	}
	getDispatch()({ type: "back", levels });
}

/**
 * Jump to any registered screen across branches of the tree.
 */
export function gotoScreen<C extends React.ComponentType<any>>(
	component: C,
	...args: GotoScreenArgs<C>
): void {
	if (!hasComponent(component)) {
		throw new Error(
			`[ink-cartridge] Component "${
				component.displayName || component.name || "anonymous"
			}" is not registered. Please call registerComponent() first.`
		);
	}
	const [params = {}] = args;
	getDispatch()({
		type: "gotoScreen",
		component,
		params: toActionParams(params),
	});
}

/**
 * Open a new layer with a unique ID and z-index.
 *
 * These lifecycle functions are module-level: they dispatch to the most
 * recently mounted provider, so they can be called from effects, key
 * handlers, or plain module code as long as a
 * {@link ScenarioManagementProvider} is mounted (or from the equivalent
 * methods of `useScreenSystem()`). Opening alone renders nothing — follow
 * it with {@link applyElement}. Higher z-index layers appear on top.
 *
 * @example
 * The full floating-layer lifecycle from a component effect: open the
 * layer, apply its element, and close it again on unmount.
 * ```tsx
 * useEffect(() => {
 *   openLayer('edit-panel', 10);
 *   applyElement('edit-panel', {
 *     elementId: 'edit-panel-element',
 *     element: EditPanel,
 *     props: { value, onClose: () => closeLayer('edit-panel') },
 *   });
 *   return () => closeLayer('edit-panel');
 * }, [value]);
 * ```
 */
export function openLayer(
	layerId: string,
	zIndex: number,
	options?: LayerOptions
): void {
	getDispatch()({ type: "openLayer", layerId, zIndex, options });
}

/**
 * Apply an element to a registered layer.
 *
 * `props` is type-checked against the element component's own prop type —
 * the same type-safety pattern `skip()` uses for `params`.
 *
 * When the target layer has not been opened, the action is ignored (with a
 * development warning) and the previous state is kept.
 *
 * @example
 * ```tsx
 * // after openLayer('edit-panel', 10)
 * applyElement('edit-panel', {
 *   elementId: 'edit-panel-element',
 *   element: EditPanel,
 *   props: { value, onClose: () => closeLayer('edit-panel') },
 * });
 * ```
 */
export function applyElement<C extends React.ComponentType<any>>(
	targetLayerId: string,
	layerElement: LayerElementInput<C>
): void {
	getDispatch()({
		type: "applyElement",
		targetLayerId,
		layerElement: toStoredLayerElement(layerElement),
	});
}

/**
 * Close a registered layer by its ID.
 *
 * Removes the layer and all of its elements; the keyboard engine drops the
 * layer's bindings with it. Typically called from the layer's own element
 * (via a bound key or a button callback) or from the cleanup of the effect
 * that opened the layer.
 *
 * @example
 * ```tsx
 * const { closeLayer } = useScreenSystem();
 * // in a key handler or button callback of the layer element:
 * closeLayer('edit-panel');
 * ```
 */
export function closeLayer(targetLayerId: string): void {
	getDispatch()({ type: "closeLayer", targetLayerId });
}

/**
 * Remove an element from a registered layer.
 *
 * The layer itself stays open — only the element is removed. Prefer
 * {@link deactivateElement} when the element should stay mounted but stop
 * receiving key events (its bindings are preserved for later
 * reactivation).
 *
 * @example
 * ```tsx
 * // replace the spinner with a fresh element, same layer
 * eraseElement('status-bar', 'spinner');
 * applyElement('status-bar', { elementId: 'done', element: DoneBadge });
 * ```
 */
export function eraseElement(
	targetLayerId: string,
	targetElementId: string
): void {
	getDispatch()({ type: "eraseElement", targetLayerId, targetElementId });
}

/**
 * Close all layers at once.
 *
 * Equivalent to calling {@link closeLayer} for every open layer; modal
 * layers are left untouched.
 *
 * @example
 * ```tsx
 * // e.g. on logout — dismiss every floating panel
 * closeAllLayer();
 * ```
 */
export function closeAllLayer(): void {
	getDispatch()({ type: "closeAllLayer" });
}

/**
 * Raise a regular layer above all other layers.
 *
 * Sets the layer's zIndex to the current maximum zIndex plus 1 and re-sorts
 * `allLayers`, so the layer moves to the top visually and wins keyboard and
 * mouse priority. The layer object is replaced via spread — its `elements`,
 * `regionFocus`, `hostPage` and `crossPage` references are kept, so the
 * layer's element components do not remount and no user state is lost.
 *
 * No-op when the layer is already the top layer. Modal layers are
 * unaffected: they live in a separate array that always renders (and takes
 * keyboard/mouse priority) above regular layers, so a raised regular layer
 * never overtakes a modal.
 *
 * @example
 * ```tsx
 * const { bringLayerToFront } = useScreenSystem();
 * bringLayerToFront('edit-panel');
 * ```
 */
export function bringLayerToFront(targetLayerId: string): void {
	getDispatch()({ type: "bringLayerToFront", targetLayerId });
}

/**
 * Undo {@link bringLayerToFront}: put a regular layer's zIndex back to the
 * value it was opened with and re-sort `allLayers`. The layer object is
 * replaced via spread — `elements`, `regionFocus`, `hostPage` and
 * `crossPage` references are kept, so element components do not remount and
 * no user state is lost.
 *
 * No-op when the layer's zIndex already equals its initial value. Modal
 * layers are unaffected, mirroring {@link bringLayerToFront}.
 *
 * @example
 * ```tsx
 * const { restoreLayerZIndex } = useScreenSystem();
 * restoreLayerZIndex('edit-panel');
 * ```
 */
export function restoreLayerZIndex(targetLayerId: string): void {
	getDispatch()({ type: "restoreLayerZIndex", targetLayerId });
}

/**
 * Open a new modal layer with a unique ID and z-index.
 *
 * The keyboard difference from a regular layer: a modal layer takes over
 * the keyboard. While it is open, key events are routed to it first and
 * blocked from reaching layers and screens below unless a binding calls
 * `allowModal` to release specific keys through the barrier (the engine
 * treats the active modal as the highest-priority pipeline stage). Modal
 * and regular layers share the layer-ID namespace, so an ID cannot be
 * reused across the two.
 *
 * @example
 * The floating modal lifecycle from a component effect:
 * ```tsx
 * useEffect(() => {
 *   openModalLayer('confirm-dialog', 100);
 *   applyElementToModalLayer('confirm-dialog', {
 *     elementId: 'confirm-dialog-element',
 *     element: ConfirmDialog,
 *     props: { onCancel: () => closeModalLayer('confirm-dialog') },
 *   });
 *   return () => closeModalLayer('confirm-dialog');
 * }, []);
 * ```
 */
export function openModalLayer(
	layerId: string,
	zIndex: number,
	options?: ModalLayerOptions
): void {
	getDispatch()({ type: "openModalLayer", layerId, zIndex, options });
}

/**
 * Apply an element to a registered modal layer.
 *
 * `props` is type-checked against the element component's own prop type —
 * the same type-safety pattern `skip()` uses for `params`.
 *
 * When the target modal layer has not been opened, the action is ignored
 * (with a development warning) and the previous state is kept.
 *
 * @example
 * ```tsx
 * // after openModalLayer('confirm-dialog', 100)
 * applyElementToModalLayer('confirm-dialog', {
 *   elementId: 'confirm-dialog-element',
 *   element: ConfirmDialog,
 *   props: { onCancel: () => closeModalLayer('confirm-dialog') },
 * });
 * ```
 */
export function applyElementToModalLayer<C extends React.ComponentType<any>>(
	targetModalLayerId: string,
	modalLayerElement: LayerElementInput<C>
): void {
	getDispatch()({
		type: "applyElementToModalLayer",
		targetModalLayerId,
		modalLayerElement: toStoredLayerElement(modalLayerElement),
	});
}

/**
 * Close a registered modal layer by its ID.
 *
 * Removes the modal layer and restores keyboard control to the layers and
 * screen below it.
 *
 * @example
 * ```tsx
 * const { closeModalLayer } = useScreenSystem();
 * // from the modal element's own key binding:
 * boundKeyboard(['q'], () => closeModalLayer('confirm-dialog'));
 * ```
 */
export function closeModalLayer(targetModalLayerId: string): void {
	getDispatch()({ type: "closeModalLayer", targetModalLayerId });
}

/**
 * Remove an element from a registered modal layer.
 *
 * The modal layer itself stays open — only the element is removed. Prefer
 * {@link deactivateElementInModalLayer} when the element should stay
 * mounted but stop receiving key events (its bindings are preserved for
 * later reactivation).
 *
 * @example
 * ```tsx
 * eraseElementInModalLayer('settings-modal', 'advanced-section');
 * ```
 */
export function eraseElementInModalLayer(
	targetModalLayerId: string,
	targetElementId: string
): void {
	getDispatch()({
		type: "eraseElementInModalLayer",
		targetModalLayerId,
		targetElementId,
	});
}

/**
 * Close all modal layers at once.
 *
 * Equivalent to calling {@link closeModalLayer} for every open modal
 * layer; regular layers are left untouched.
 *
 * @example
 * ```tsx
 * // e.g. on logout — dismiss every dialog
 * closeAllModalLayer();
 * ```
 */
export function closeAllModalLayer(): void {
	getDispatch()({ type: "closeAllModalLayer" });
}

/**
 * Activate a previously deactivated element on a registered layer.
 * The element stays mounted — only its keyboard-active flag is set to `true`,
 * so the keyboard engine resumes dispatching key events to its bindings.
 */
export function activateElement(
	targetLayerId: string,
	targetElementId: string
): void {
	getDispatch()({ type: "activateElement", targetLayerId, targetElementId });
}

/**
 * Deactivate an element on a registered layer.
 * The element stays mounted — only its keyboard-active flag is set to `false`,
 * so the keyboard engine stops dispatching key events to its bindings while
 * keeping all registration data intact for a later reactivation.
 */
export function deactivateElement(
	targetLayerId: string,
	targetElementId: string
): void {
	getDispatch()({ type: "deactivateElement", targetLayerId, targetElementId });
}

/**
 * Modal-layer counterpart of {@link activateElement}.
 */
export function activateElementInModalLayer(
	targetModalLayerId: string,
	targetElementId: string
): void {
	getDispatch()({
		type: "activateElementInModalLayer",
		targetModalLayerId,
		targetElementId,
	});
}

/**
 * Modal-layer counterpart of {@link deactivateElement}.
 */
export function deactivateElementInModalLayer(
	targetModalLayerId: string,
	targetElementId: string
): void {
	getDispatch()({
		type: "deactivateElementInModalLayer",
		targetModalLayerId,
		targetElementId,
	});
}

/**
 * Find the common ancestor of the current path and a target component.
 *
 * Walks from the bottom of `currentPath` upward and returns the first
 * node that is also among the target's ancestors.
 */
function findCommonAncestor(
	currentPath: React.ComponentType<any>[],
	target: React.ComponentType<any>
): React.ComponentType<any> {
	const targetAncestors = new Set<React.ComponentType<any>>();
	let node: React.ComponentType<any> | null | undefined = target;
	while (node) {
		targetAncestors.add(node);
		node = getParent(node);
	}

	for (let i = currentPath.length - 1; i >= 0; i--) {
		if (targetAncestors.has(currentPath[i])) {
			return currentPath[i];
		}
	}

	throw new Error(
		`[ink-cartridge] Cannot find common ancestor. The target component may not be in the same tree.`
	);
}

/**
 * Build the path from an ancestor down to the target, excluding the ancestor itself.
 */
function buildPathFrom(
	ancestor: React.ComponentType<any>,
	target: React.ComponentType<any>
): React.ComponentType<any>[] {
	const path: React.ComponentType<any>[] = [];
	let node: React.ComponentType<any> | null | undefined = target;
	while (node && node !== ancestor) {
		path.push(node);
		node = getParent(node);
	}
	if (!node) {
		throw new Error(
			`[ink-cartridge] Target component is not a descendant of the ancestor.`
		);
	}
	path.reverse();
	return path;
}

export function getPath(pages: Page[]) {
  return pages.map(page => page.component)
}

/**
 * Pure reducer for {@link ScreenState}.
 *
 * Handles all navigation actions: skip (down), back (up), gotoScreen
 * (cross-branch), openLayer/closeLayer/applyElement/eraseElement,
 * openModalLayer/closeModalLayer/applyElementToModalLayer/eraseElementInModalLayer,
 * activate/deactive element variants, and closeAllLayer/closeAllModalLayer.
 *
 * Navigation actions filter out non-persistent layers and modal layers
 * (crossPage: false) and recalculate active state for persistent entries.
 *
 * Validation failures (unknown layer/element, out-of-range navigation, ID
 * conflicts) do NOT escape as exceptions: a throw inside `useReducer` is not
 * catchable at the dispatch call site and unmounts the app. They warn in
 * development and leave the previous state unchanged.
 */
function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
	try {
		return reduceScreenAction(state, action);
	} catch (err) {
		warnInDev(
			`${err instanceof Error ? err.message : String(err)} — action ignored.`
		);
		return state;
	}
}

function reduceScreenAction(state: ScreenState, action: ScreenAction): ScreenState {
	switch (action.type) {
		case "skip": {
			const current = state.path[state.path.length - 1];

			// Skipping to the current screen refreshes it in place; any other
			// target must be a direct child.
			const isSelf = action.component === current.component;
			if (!isSelf && !isChildOf(action.component, current.component)) {
				throw new Error(
					`[ink-cartridge] "${
						action.component.displayName || action.component.name || "anonymous"
					}" is not a child of "${
						current.component.displayName ||
						current.component.name ||
						"anonymous"
					}". Use skip to navigate down the tree, or gotoScreen to jump across branches.`
				);
			}

			const template = getTemplate(action.component) ?? {};
			const mergedParams = { ...template, ...action.params };

			const crossPageLayers = state.allLayers.filter(
				(each) => each.crossPage === true
			);

			const crossPageModalLayers = state.allModalLayers.filter(
				(each) => each.crossPage === true
			);

			if (isSelf) {
				// Replace the top entry instead of pushing: path depth is
				// unchanged so back() returns to the real parent. With
				// onlyAttribute the existing Page object is kept by reference
				// (regionFocus map survives) and the counter stays put, so the
				// mounted instance is not remounted — only its props change.
				const newTopPage: Page = action.onlyAttribute
					? current
					: { component: action.component, regionFocus: new Map() };

				return {
					path: [...state.path.slice(0, -1), newTopPage],
					pathParams: [...state.pathParams.slice(0, -1), mergedParams],
					counter: action.onlyAttribute ? state.counter : state.counter + 1,
					allLayers: crossPageLayers,
					allModalLayers: crossPageModalLayers,
				};
			}

			const newPath: Page[] = [
				...state.path,
				{
					component: action.component,
					regionFocus: new Map(),
				},
			];

			return {
				path: newPath,
				pathParams: [...state.pathParams, mergedParams],
				counter: state.counter + 1,
				allLayers: crossPageLayers,
				allModalLayers: crossPageModalLayers,
			};
		}

		case "back": {
			const levels = action.levels ?? 1;

			if (state.path.length <= levels) {
				throw new Error(
					levels === 1
						? "[ink-cartridge] back() failed: already at the root node, cannot go back."
						: `[ink-cartridge] back(${levels}) failed: current depth is ${state.path.length}, cannot go back ${levels} levels.`
				);
			}

			const newPath = state.path.slice(0, -levels);

			const crossPageLayers = state.allLayers.filter(
				(each) => each.crossPage === true
			);

			const crossPageModalLayers = state.allModalLayers.filter(
				(each) => each.crossPage === true
			);

			return {
				path: newPath,
				pathParams: state.pathParams.slice(0, -levels),
				counter: state.counter + 1,
				allLayers: crossPageLayers,
				allModalLayers: crossPageModalLayers,
			};
		}

		case "gotoScreen": {
			const commonAncestor = findCommonAncestor(
				state.path.map((each) => each.component),
				action.component
			);
			const ancestorIndex = state.path
				.map((each) => each.component)
				.indexOf(commonAncestor);

			if (ancestorIndex === -1) {
				throw new Error(
					`[ink-cartridge] gotoScreen failed: cannot locate common ancestor.`
				);
			}

			const suffix = buildPathFrom(commonAncestor, action.component);
			const newPath = [
				...state.path.slice(0, ancestorIndex + 1),
				...suffix.map((each) => {
					return {
						component: each,
						regionFocus: new Map(),
					} as Page;
				}),
			];

			const template = getTemplate(action.component) ?? {};
			const mergedParams = { ...template, ...action.params };

			const newPathParams = [
				...state.pathParams.slice(0, ancestorIndex + 1),
				...suffix.map((comp) => {
					const tpl = getTemplate(comp) ?? {};
					return comp === action.component ? mergedParams : tpl;
				}),
			];

			const crossPageLayers = state.allLayers.filter(
				(each) => each.crossPage === true
			);
			const crossPageModalLayers = state.allModalLayers.filter(
				(each) => each.crossPage === true
			);
			return {
				path: newPath,
				pathParams: newPathParams,
				counter: state.counter + 1,
				allLayers: crossPageLayers,
				allModalLayers: crossPageModalLayers,
			};
		}

		case "openLayer": {
			// A key handler can re-fire before the layer it opened has mounted
			// (its keyboard bindings register in a later effect), or a repeated
			// key can bubble back to the host page while the layer is still open.
			// Re-opening an existing ID is a user race, not a bug — treat it as a
			// no-op instead of crashing the app from inside a reducer.
			if (state.allLayers.some((each) => each.layerId === action.layerId)) {
				warnInDev(
					`[ink-cartridge] openLayer("${action.layerId}") ignored: the ID is already registered. Duplicate opens are no-ops; close the layer first to reopen it.`
				);
				return state;
			}
			if (
				state.allModalLayers.some((each) => each.layerId === action.layerId)
			) {
				throw new Error(
					`
          [ink-cartridge] Layer ID "${action.layerId}" is already used by a modal layer. Modal layers and normal layers share the ID namespace in the keyboard engine, so reuse across the two is not allowed.
          `
				);
			}

			const newLayer: Layer = {
				layerId: action.layerId,
				zIndex: action.zIndex,
				initialZIndex: action.zIndex,
				elements: new Map(),
				crossPage: action.options?.crossPage ?? false,
				// Use the current timestamp as the creation time to ensure no errors occur,
				// even if the z-index values are identical.
				createdAt: Date.now(),
				automaticTakeoverKeyboard:
					action.options?.automaticTakeoverKeyboard ?? false,
				hostPage: getPath(state.path)[state.path.length - 1] ?? null,
				regionFocus: new Map(),
			};

			const newLayers = sortLayers([...state.allLayers, newLayer]);

			return {
				...state,
				allLayers: newLayers,
			};
		}

		case "applyElement": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);

			if (targetLayerIndex === -1) {
				throw new Error(
					`
          [ink-cartridge] The target ${action.targetLayerId} you entered has not been registered.

          Try calling the openLayer method.
          For example:
          const { openLayer } = useScreenSystem()

          openLayer(${action.targetLayerId}, 1)
          `
				);
			}

			const targetLayer = state.allLayers[targetLayerIndex];

			// Part of the same key-mash race as openLayer: the re-fired handler
			// re-applies the element right after the duplicate open is ignored.
			if (targetLayer.elements.has(action.layerElement.elementId)) {
				warnInDev(
					`[ink-cartridge] applyElement("${action.layerElement.elementId}" on "${targetLayer.layerId}") ignored: the element ID is already applied. Duplicate applies are no-ops; erase the element first to re-apply it.`
				);
				return state;
			}

			const newElements = new Map(targetLayer.elements);
			newElements.set(action.layerElement.elementId, action.layerElement);

			const newAllLayers = [...state.allLayers];
			newAllLayers[targetLayerIndex] = {
				...targetLayer,
				elements: newElements,
			};

			return {
				...state,
				allLayers: newAllLayers,
			};
		}

		case "closeLayer": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);
			// Mirror of the openLayer race: a second close dispatched before the
			// layer's binding cleanup ran would otherwise throw mid-render.
			if (targetLayerIndex === -1) {
				warnInDev(
					`[ink-cartridge] closeLayer("${action.targetLayerId}") ignored: no layer with this ID is registered. Duplicate closes are no-ops.`
				);
				return state;
			}

			const remainingLayers = state.allLayers.filter(
				(_, idx) => idx !== targetLayerIndex
			);
			const newLayers = sortLayers(remainingLayers);

			return {
				...state,
				allLayers: newLayers,
			};
		}

		case "eraseElement": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);

			if (targetLayerIndex === -1) {
				throw new Error(
					`
          [ink-cartridge] The layer ${action.targetLayerId} you want to delete is not registered; you might have made a typo, or it was never registered at all.
          `
				);
			}

			const targetLayer = state.allLayers[targetLayerIndex];

			// Mirror of the applyElement race: a second erase dispatched before
			// the element's binding cleanup ran must not crash the app.
			if (!targetLayer.elements.has(action.targetElementId)) {
				warnInDev(
					`[ink-cartridge] eraseElement("${action.targetElementId}" from "${action.targetLayerId}") ignored: no element with this ID is applied. Duplicate erases are no-ops.`
				);
				return state;
			}

			const newElements = new Map(targetLayer.elements);
			newElements.delete(action.targetElementId);

			const newAllLayers = [...state.allLayers];
			newAllLayers[targetLayerIndex] = {
				...targetLayer,
				elements: newElements,
			};

			return {
				...state,
				allLayers: newAllLayers,
			};
		}

		case "closeAllLayer": {
			return {
				...state,
				allLayers: [],
			};
		}

		case "bringLayerToFront": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);

			// Modal layers live in a separate array and always stay above
			// regular layers, so an ID that is not in allLayers — unknown,
			// already closed, or a modal layer ID — is a no-op, mirroring the
			// closeLayer race handling.
			if (targetLayerIndex === -1) {
				warnInDev(
					`[ink-cartridge] bringLayerToFront("${action.targetLayerId}") ignored: no regular layer with this ID is registered. Modal layers are unaffected by bringLayerToFront.`
				);
				return state;
			}

			// Already the top layer — returning the identical state skips the
			// re-render and keeps zIndex from drifting.
			if (targetLayerIndex === state.allLayers.length - 1) {
				return state;
			}

			const targetLayer = state.allLayers[targetLayerIndex];
			const maxZIndex = state.allLayers[state.allLayers.length - 1].zIndex;

			// Spread keeps elements/regionFocus/hostPage/crossPage references
			// intact, so element components do not remount and user state
			// survives — never close+reopen to simulate this.
			const raisedLayer: Layer = { ...targetLayer, zIndex: maxZIndex + 1 };

			const newAllLayers = sortLayers([
				...state.allLayers.slice(0, targetLayerIndex),
				raisedLayer,
				...state.allLayers.slice(targetLayerIndex + 1),
			]);

			return {
				...state,
				allLayers: newAllLayers,
			};
		}

		case "restoreLayerZIndex": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);

			// Mirrors bringLayerToFront: an unknown, closed, or modal layer
			// ID is a no-op — modal layers live in a separate array.
			if (targetLayerIndex === -1) {
				warnInDev(
					`[ink-cartridge] restoreLayerZIndex("${action.targetLayerId}") ignored: no regular layer with this ID is registered.`
				);
				return state;
			}

			const targetLayer = state.allLayers[targetLayerIndex];

			// Nothing to restore — returning the identical state skips the
			// re-render entirely.
			if (targetLayer.zIndex === targetLayer.initialZIndex) {
				return state;
			}

			// Spread keeps elements/regionFocus/hostPage/crossPage references
			// intact — the same no-remount guarantee as bringLayerToFront.
			const restoredLayer: Layer = {
				...targetLayer,
				zIndex: targetLayer.initialZIndex,
			};

			const newAllLayers = sortLayers([
				...state.allLayers.slice(0, targetLayerIndex),
				restoredLayer,
				...state.allLayers.slice(targetLayerIndex + 1),
			]);

			return {
				...state,
				allLayers: newAllLayers,
			};
		}

		case "activateElement": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);
			if (targetLayerIndex === -1) {
				throw new Error(
					`[ink-cartridge] activateElement: layer "${action.targetLayerId}" is not registered.`
				);
			}
			const targetLayer = state.allLayers[targetLayerIndex];
			const targetElement = targetLayer.elements.get(action.targetElementId);
			if (!targetElement) {
				throw new Error(
					`[ink-cartridge] activateElement: element "${action.targetElementId}" does not exist on layer "${action.targetLayerId}".`
				);
			}
			if (targetElement.active !== false) return state;

			const newElements = new Map(targetLayer.elements);
			newElements.set(action.targetElementId, {
				...targetElement,
				active: true,
			});
			const newAllLayers = [...state.allLayers];
			newAllLayers[targetLayerIndex] = {
				...targetLayer,
				elements: newElements,
			};
			return { ...state, allLayers: newAllLayers };
		}

		case "deactivateElement": {
			const targetLayerIndex = state.allLayers.findIndex(
				(each) => each.layerId === action.targetLayerId
			);
			if (targetLayerIndex === -1) {
				throw new Error(
					`[ink-cartridge] deactivateElement: layer "${action.targetLayerId}" is not registered.`
				);
			}
			const targetLayer = state.allLayers[targetLayerIndex];
			const targetElement = targetLayer.elements.get(action.targetElementId);
			if (!targetElement) {
				throw new Error(
					`[ink-cartridge] deactivateElement: element "${action.targetElementId}" does not exist on layer "${action.targetLayerId}".`
				);
			}
			if (targetElement.active === false) return state;

			const newElements = new Map(targetLayer.elements);
			newElements.set(action.targetElementId, {
				...targetElement,
				active: false,
			});
			const newAllLayers = [...state.allLayers];
			newAllLayers[targetLayerIndex] = {
				...targetLayer,
				elements: newElements,
			};
			return { ...state, allLayers: newAllLayers };
		}

		case "openModalLayer": {
			// Same user-race no-op as openLayer: a repeated key can re-open an
			// existing modal layer before its bindings are live.
			if (
				state.allModalLayers.some((each) => each.layerId === action.layerId)
			) {
				warnInDev(
					`[ink-cartridge] openModalLayer("${action.layerId}") ignored: the ID is already registered. Duplicate opens are no-ops; close the modal layer first to reopen it.`
				);
				return state;
			}
			if (state.allLayers.some((each) => each.layerId === action.layerId)) {
				throw new Error(
					`
          [ink-cartridge] Modal layer ID "${action.layerId}" is already used by a normal layer. Modal layers and normal layers share the ID namespace in the keyboard engine, so reuse across the two is not allowed.
          `
				);
			}

			const newModalLayer: ModalLayer = {
				layerId: action.layerId,
				zIndex: action.zIndex,
				initialZIndex: action.zIndex,
				elements: new Map(),
				crossPage: action.options?.crossPage ?? false,
				// Use the current timestamp as the creation time to ensure no errors occur,
				// even if the z-index values are identical.
				createdAt: Date.now(),
				automaticTakeoverKeyboard:
					action.options?.automaticTakeoverKeyboard ?? false,
				hostPage: getPath(state.path)[state.path.length - 1] ?? null,
				regionFocus: new Map(),
			};

			const newModalLayers = sortLayers([
				...state.allModalLayers,
				newModalLayer,
			]);

			return {
				...state,
				allModalLayers: newModalLayers,
			};
		}

		case "applyElementToModalLayer": {
			const targetModalLayerIndex = state.allModalLayers.findIndex(
				(each) => each.layerId === action.targetModalLayerId
			);

			if (targetModalLayerIndex === -1) {
				throw new Error(
					`
          [ink-cartridge] The target modal layer ${action.targetModalLayerId} you entered has not been registered.

          Try calling the openModalLayer method.
          For example:
          const { openModalLayer } = useScreenSystem()

          openModalLayer(${action.targetModalLayerId}, 1)
          `
				);
			}

			const targetModalLayer = state.allModalLayers[targetModalLayerIndex];

			// Mirror of the applyElement no-op for the same key-mash race.
			if (targetModalLayer.elements.has(action.modalLayerElement.elementId)) {
				warnInDev(
					`[ink-cartridge] applyElementToModalLayer("${action.modalLayerElement.elementId}" on "${targetModalLayer.layerId}") ignored: the element ID is already applied. Duplicate applies are no-ops; erase the element first to re-apply it.`
				);
				return state;
			}

			const newElements = new Map(targetModalLayer.elements);
			newElements.set(
				action.modalLayerElement.elementId,
				action.modalLayerElement
			);

			const newAllModalLayers = [...state.allModalLayers];
			newAllModalLayers[targetModalLayerIndex] = {
				...targetModalLayer,
				elements: newElements,
			};

			return {
				...state,
				allModalLayers: newAllModalLayers,
			};
		}

		case "closeModalLayer": {
			const targetModalLayerIndex = state.allModalLayers.findIndex(
				(each) => each.layerId === action.targetModalLayerId
			);
			// Mirror of the closeLayer race: a second close before the modal
			// layer's binding cleanup ran is a no-op, not an error.
			if (targetModalLayerIndex === -1) {
				warnInDev(
					`[ink-cartridge] closeModalLayer("${action.targetModalLayerId}") ignored: no modal layer with this ID is registered. Duplicate closes are no-ops.`
				);
				return state;
			}

			const remainingModalLayers = state.allModalLayers.filter(
				(_, idx) => idx !== targetModalLayerIndex
			);
			const newModalLayers = sortLayers(remainingModalLayers);

			return {
				...state,
				allModalLayers: newModalLayers,
			};
		}

		case "eraseElementInModalLayer": {
			const targetModalLayerIndex = state.allModalLayers.findIndex(
				(each) => each.layerId === action.targetModalLayerId
			);

			if (targetModalLayerIndex === -1) {
				throw new Error(
					`
          [ink-cartridge] The modal layer ${action.targetModalLayerId} you want to delete elements from is not registered; you might have made a typo, or it was never registered at all.
          `
				);
			}

			const targetModalLayer = state.allModalLayers[targetModalLayerIndex];

			// Mirror of the eraseElement no-op for the same key-mash race.
			if (!targetModalLayer.elements.has(action.targetElementId)) {
				warnInDev(
					`[ink-cartridge] eraseElementInModalLayer("${action.targetElementId}" from "${action.targetModalLayerId}") ignored: no element with this ID is applied. Duplicate erases are no-ops.`
				);
				return state;
			}

			const newElements = new Map(targetModalLayer.elements);
			newElements.delete(action.targetElementId);

			const newAllModalLayers = [...state.allModalLayers];
			newAllModalLayers[targetModalLayerIndex] = {
				...targetModalLayer,
				elements: newElements,
			};

			return {
				...state,
				allModalLayers: newAllModalLayers,
			};
		}

		case "closeAllModalLayer": {
			return {
				...state,
				allModalLayers: [],
			};
		}

		case "activateElementInModalLayer": {
			const targetModalLayerIndex = state.allModalLayers.findIndex(
				(each) => each.layerId === action.targetModalLayerId
			);
			if (targetModalLayerIndex === -1) {
				throw new Error(
					`[ink-cartridge] activateElementInModalLayer: modal layer "${action.targetModalLayerId}" is not registered.`
				);
			}
			const targetModalLayer = state.allModalLayers[targetModalLayerIndex];
			const targetElement = targetModalLayer.elements.get(
				action.targetElementId
			);
			if (!targetElement) {
				throw new Error(
					`[ink-cartridge] activateElementInModalLayer: element "${action.targetElementId}" does not exist on modal layer "${action.targetModalLayerId}".`
				);
			}
			if (targetElement.active !== false) return state;

			const newElements = new Map(targetModalLayer.elements);
			newElements.set(action.targetElementId, {
				...targetElement,
				active: true,
			});
			const newAllModalLayers = [...state.allModalLayers];
			newAllModalLayers[targetModalLayerIndex] = {
				...targetModalLayer,
				elements: newElements,
			};
			return { ...state, allModalLayers: newAllModalLayers };
		}

		case "deactivateElementInModalLayer": {
			const targetModalLayerIndex = state.allModalLayers.findIndex(
				(each) => each.layerId === action.targetModalLayerId
			);
			if (targetModalLayerIndex === -1) {
				throw new Error(
					`[ink-cartridge] deactivateElementInModalLayer: modal layer "${action.targetModalLayerId}" is not registered.`
				);
			}
			const targetModalLayer = state.allModalLayers[targetModalLayerIndex];
			const targetElement = targetModalLayer.elements.get(
				action.targetElementId
			);
			if (!targetElement) {
				throw new Error(
					`[ink-cartridge] deactivateElementInModalLayer: element "${action.targetElementId}" does not exist on modal layer "${action.targetModalLayerId}".`
				);
			}
			if (targetElement.active === false) return state;

			const newElements = new Map(targetModalLayer.elements);
			newElements.set(action.targetElementId, {
				...targetElement,
				active: false,
			});
			const newAllModalLayers = [...state.allModalLayers];
			newAllModalLayers[targetModalLayerIndex] = {
				...targetModalLayer,
				elements: newElements,
			};
			return { ...state, allModalLayers: newAllModalLayers };
		}

		default:
			return state;
	}
}

/**
 * Props for the {@link ScenarioManagementProvider} component.
 */
export interface ScenarioManagementProviderProps {
	/** The app tree rendered inside the provider. */
	children: ReactNode;
	/** Initial screen component (required; must be registered via registerComponent). */
	defaultScreen: React.ComponentType<any>;
	/** Initial props (optional; defaults to the template props registered with the component). */
	defaultParams?: Record<string, unknown>;

	/** When true, the screen fills the full terminal height instead of the parent box. */
	fullScreen?: boolean;
}

/**
 * Screen-management context provider.
 *
 * Wraps the application and enables tree-based screen navigation, overlays,
 * and module-level navigation functions.
 */
export function ScenarioManagementProvider({
	children,
	defaultScreen,
	defaultParams,
	fullScreen,
}: ScenarioManagementProviderProps) {
	if (!hasComponent(defaultScreen)) {
		throw new Error(
			`[ink-cartridge] defaultScreen "${
				defaultScreen.displayName || defaultScreen.name || "anonymous"
			}" is not registered. Please call registerComponent() first.`
		);
	}

	const initialParams = defaultParams ?? getTemplate(defaultScreen) ?? {};

	const [state, dispatch] = useReducer(screenReducer, {
		path: [{
      component: defaultScreen,
      regionFocus: new Map()
    }],
		pathParams: [initialParams],
		counter: 0,
		allLayers: [],
		allModalLayers: [],
	});

	useEffect(() => {
		_dispatchers.add(dispatch);
		return () => {
			_dispatchers.delete(dispatch);
		};
	}, []);

	const topPage = state.path[state.path.length - 1];
	const topParams = state.pathParams[state.pathParams.length - 1];

	const pageLayer = useMemo(
		() =>
			React.createElement(topPage.component, {
				...topParams,
				key: state.counter,
			}),
		[topPage, topParams, state.counter]
	);

	// Navigation methods provided via context.
	const skipInContext: SkipFn = useMemo(
		() => (component, ...args) => {
			if (!hasComponent(component)) {
				throw new Error(
					`[ink-cartridge] Component "${
						component.displayName || component.name || "anonymous"
					}" is not registered.`
				);
			}
			const [params = {}, options] = args;
			dispatch({
				type: "skip",
				component,
				params: toActionParams(params),
				onlyAttribute: options?.onlyAttribute ?? false,
			});
		},
		[]
	);

	const backInContext: BackFn = useMemo(
		() =>
			(levels: number = 1) => {
				if (!Number.isInteger(levels) || levels < 1) {
					throw new Error("[ink-cartridge] back() levels must be an integer >= 1.");
				}
				dispatch({ type: "back", levels });
			},
		[]
	);

	const gotoScreenInContext: GotoScreenFn = useMemo(
		() => (component, ...args) => {
			if (!hasComponent(component)) {
				throw new Error(
					`[ink-cartridge] Component "${
						component.displayName || component.name || "anonymous"
					}" is not registered.`
				);
			}
			const [params = {}] = args;
			dispatch({
				type: "gotoScreen",
				component,
				params: toActionParams(params),
			});
		},
		[]
	);

	const openLayerInContext: OpenLayerFn = useMemo(
		() => (layerId: string, zIndex: number, options?: LayerOptions) => {
			dispatch({
				type: "openLayer",
				layerId,
				zIndex,
				options: options,
			});
		},
		[]
	);

	const applyElementInContext: ApplyElementFn = useMemo(
		() => (targetLayerId: string, layerElement: AnyLayerElementInput) => {
			dispatch({
				type: "applyElement",
				targetLayerId,
				layerElement: toStoredLayerElement(layerElement),
			});
		},
		[]
	);

	const closeLayerInContext: CloseLayerFn = useMemo(
		() => (targetLayerId: string) => {
			dispatch({ type: "closeLayer", targetLayerId });
		},
		[]
	);

	const eraseElementInContext: EraseElementFn = useMemo(
		() => (targetLayerId: string, targetElementId: string) => {
			dispatch({ type: "eraseElement", targetLayerId, targetElementId });
		},
		[]
	);

	const closeAllLayerInContext: CloseAllLayerFn = useMemo(
		() => () => {
			dispatch({ type: "closeAllLayer" });
		},
		[]
	);

	const bringLayerToFrontInContext: BringLayerToFrontFn = useMemo(
		() => (targetLayerId: string) => {
			dispatch({ type: "bringLayerToFront", targetLayerId });
		},
		[]
	);

	const restoreLayerZIndexInContext: RestoreLayerZIndexFn = useMemo(
		() => (targetLayerId: string) => {
			dispatch({ type: "restoreLayerZIndex", targetLayerId });
		},
		[]
	);

	const activateElementInContext: ActivateElementFn = useMemo(
		() => (targetLayerId: string, targetElementId: string) => {
			dispatch({ type: "activateElement", targetLayerId, targetElementId });
		},
		[]
	);

	const deactivateElementInContext: DeactivateElementFn = useMemo(
		() => (targetLayerId: string, targetElementId: string) => {
			dispatch({ type: "deactivateElement", targetLayerId, targetElementId });
		},
		[]
	);

	const openModalLayerInContext: OpenModalLayerFn = useMemo(
		() => (layerId: string, zIndex: number, options?: ModalLayerOptions) => {
			dispatch({
				type: "openModalLayer",
				layerId,
				zIndex,
				options: options,
			});
		},
		[]
	);

	const applyElementToModalLayerInContext: ApplyElementToModalLayerFn = useMemo(
		() =>
			(
				targetModalLayerId: string,
				modalLayerElement: AnyLayerElementInput
			) => {
				dispatch({
					type: "applyElementToModalLayer",
					targetModalLayerId,
					modalLayerElement: toStoredLayerElement(modalLayerElement),
				});
			},
		[]
	);

	const closeModalLayerInContext: CloseModalLayerFn = useMemo(
		() => (targetModalLayerId: string) => {
			dispatch({ type: "closeModalLayer", targetModalLayerId });
		},
		[]
	);

	const eraseElementInModalLayerInContext: EraseElementInModalLayerFn = useMemo(
		() => (targetModalLayerId: string, targetElementId: string) => {
			dispatch({
				type: "eraseElementInModalLayer",
				targetModalLayerId,
				targetElementId,
			});
		},
		[]
	);

	const closeAllModalLayerInContext: CloseAllModalLayerFn = useMemo(
		() => () => {
			dispatch({ type: "closeAllModalLayer" });
		},
		[]
	);

	const activateElementInModalLayerInContext: ActivateElementInModalLayerFn =
		useMemo(
			() => (targetModalLayerId: string, targetElementId: string) => {
				dispatch({
					type: "activateElementInModalLayer",
					targetModalLayerId,
					targetElementId,
				});
			},
			[]
		);

	const deactivateElementInModalLayerInContext: DeactivateElementInModalLayerFn =
		useMemo(
			() => (targetModalLayerId: string, targetElementId: string) => {
				dispatch({
					type: "deactivateElementInModalLayer",
					targetModalLayerId,
					targetElementId,
				});
			},
			[]
		);

	const value: ScreenSystemContextValue = useMemo(
		() => ({
			pageLayer,
			allLayers: state.allLayers,
			allModalLayers: state.allModalLayers,
			currentPath: state.path,
			skip: skipInContext,
			back: backInContext,
			gotoScreen: gotoScreenInContext,
			openLayer: openLayerInContext,
			applyElement: applyElementInContext,
			closeLayer: closeLayerInContext,
			eraseElement: eraseElementInContext,
			closeAllLayer: closeAllLayerInContext,
			bringLayerToFront: bringLayerToFrontInContext,
			restoreLayerZIndex: restoreLayerZIndexInContext,
			activateElement: activateElementInContext,
			deactivateElement: deactivateElementInContext,
			openModalLayer: openModalLayerInContext,
			applyElementToModalLayer: applyElementToModalLayerInContext,
			closeModalLayer: closeModalLayerInContext,
			eraseElementInModalLayer: eraseElementInModalLayerInContext,
			closeAllModalLayer: closeAllModalLayerInContext,
			activateElementInModalLayer: activateElementInModalLayerInContext,
			deactivateElementInModalLayer: deactivateElementInModalLayerInContext,
			fullScreen,
		}),
		[
			pageLayer,
			state.path,
			state.allLayers,
			state.allModalLayers,
			skipInContext,
			backInContext,
			gotoScreenInContext,
			openLayerInContext,
			applyElementInContext,
			closeLayerInContext,
			eraseElementInContext,
			closeAllLayerInContext,
			bringLayerToFrontInContext,
			restoreLayerZIndexInContext,
			activateElementInContext,
			deactivateElementInContext,
			openModalLayerInContext,
			applyElementToModalLayerInContext,
			closeModalLayerInContext,
			eraseElementInModalLayerInContext,
			closeAllModalLayerInContext,
			activateElementInModalLayerInContext,
			deactivateElementInModalLayerInContext,
			fullScreen,
		]
	);

	return (
		<ScreenSystemContext.Provider value={value}>
			{children}
		</ScreenSystemContext.Provider>
	);
}
