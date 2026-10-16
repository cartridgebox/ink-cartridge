import React from "react";

/** Registration metadata for a screen in the navigation tree. */
export interface RegisterOptions {
	/**
	 * The parent component in the navigation tree.
	 * If not provided, the component is considered a root candidate.
	 */
	parent?: React.ComponentType<any>;
}

/** Options for {@link skip} and {@link gotoScreen} — navigation flags. */
export interface SkipOptions {
	/**
	 * Refresh an already-mounted target in place instead of remounting it.
	 *
	 * Only meaningful when the target is the screen that is mounted right now:
	 * the current screen for {@link skip}, the current screen or one of its
	 * ancestors for {@link gotoScreen}.
	 *
	 * - `true` — only the component's props are updated; the component is not
	 *   remounted, so its internal state and mouse regionFocus survive. Useful
	 *   for performance or when preserving internal state.
	 * - `false` (default) — the target is remounted with the new props,
	 *   resetting its internal state.
	 *
	 * Ignored (silently) when the target is not the mounted screen: skipping to
	 * a different child screen, or jumping to a screen that is not on the
	 * current path. In either case, non-crossPage layers are filtered out, same
	 * as any navigation.
	 */
	onlyAttribute?: boolean;
}


/** Action dispatched when navigating down to a child screen. */
export interface SkipAction {
	type: "skip";
	/** The target component to navigate to. */
	component: React.ComponentType<any>;
	/** Props to merge with the component's registered template. */
	params: Record<string, unknown>;
	/** When skipping to the current screen: true keeps the instance (props-only update), false remounts it. */
	onlyAttribute: boolean;
}

/** Action dispatched when navigating back to the parent screen. */
export interface BackAction {
	type: "back";
	/** Number of levels to go back. Defaults to 1. */
	levels?: number;
}

/** Action dispatched when jumping to any registered screen across branches. */
export interface GotoScreenAction {
	type: "gotoScreen";
	/** The target component to navigate to. */
	component: React.ComponentType<any>;
	/** Props to merge with the component's registered template. */
	params: Record<string, unknown>;
	/** When the target is already on the path: true keeps the instance (props-only update), false remounts it. */
	onlyAttribute: boolean;
}

/**
 * Navigation-args rest-tuple for {@link skip}.
 *
 * The `params` element is optional only when the target component declares no
 * required props, so `skip(Child)` compiles for prop-less screens while
 * `skip(ChildWithRequiredProps)` still requires passing props.
 *
 * @typeParam C - The target component type.
 */
export type SkipArgs<C extends React.ComponentType<any>> =
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` probes "no required props" ({} assignable to ComponentProps), not an empty-object type
	{} extends React.ComponentProps<C>
		? [params?: React.ComponentProps<C>, options?: SkipOptions]
		: [params: React.ComponentProps<C>, options?: SkipOptions];

/**
 * Navigation-args rest-tuple for {@link gotoScreen}.
 *
 * Same optionality rule as {@link SkipArgs}: `params` is required only when
 * the target component declares required props, and `options` carries
 * navigation flags such as {@link SkipOptions.onlyAttribute}.
 *
 * @typeParam C - The target component type.
 */
export type GotoScreenArgs<C extends React.ComponentType<any>> =
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` probes "no required props" ({} assignable to ComponentProps), not an empty-object type
	{} extends React.ComponentProps<C>
		? [params?: React.ComponentProps<C>, options?: SkipOptions]
		: [params: React.ComponentProps<C>, options?: SkipOptions];

/**
 * Function signature for navigating to a direct child of the current screen.
 *
 * The trailing arguments follow {@link SkipArgs}: `params` is optional when
 * the target declares no required props, and `options` carries navigation
 * flags such as {@link SkipOptions.onlyAttribute}.
 *
 * @typeParam C - The component type (must be a React component).
 * @param component - The child component (must be registered and a direct child).
 */
export type SkipFn = <C extends React.ComponentType<any>>(
	component: C,
	...args: SkipArgs<C>
) => void;

/** Function signature for navigating back to the parent screen. */
export type BackFn = (levels?: number) => void;

/**
 * Function signature for jumping to any registered screen across branches.
 *
 * The trailing arguments follow {@link GotoScreenArgs}: `params` is optional
 * when the target declares no required props, and `options` carries
 * {@link SkipOptions.onlyAttribute}. A target that is already on the current
 * path (the current screen or one of its ancestors) takes the params in place
 * of its own and is remounted by default; pass `{ onlyAttribute: true }` to
 * update only its props and keep the mounted instance.
 *
 * @typeParam C - The target component type.
 * @param component - The target component (must be registered).
 */
export type GotoScreenFn = <C extends React.ComponentType<any>>(
	component: C,
	...args: GotoScreenArgs<C>
) => void;



