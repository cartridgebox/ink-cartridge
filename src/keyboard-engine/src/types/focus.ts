import { BaseBoundKeyEntry, PageBoundKeyEntry } from "./binding.js";
import { defaultTargetsSymbol } from "./default-targets-symbol.js";
import { KeyRule } from "./key-rule.js";

/**
 * Base keyboard state shared by {@link FocusTarget} and
 * {@link PageFocusTarget}.
 */
export interface BaseFocusTarget {
  /** Key rules marked as transparent on this target (pass-through). */
  penetrationKeys: KeyRule[];
  /** Key rules stopped on this target (propagation barrier). */
  stoppedKeys: KeyRule[];
  /** Maps action IDs to the normalized keys that trigger them (for stopAction). */
  actionKeysMap: Map<string, string[]>;

  /** Keys allowed to pass through a modal barrier while this focus target is active. */
  allowedKeys: KeyRule[];

  /**
   * Number of live bindings holding this target.
   *
   * Only maintained when the engine runs with `releaseFocusWhenEmpty`; the
   * target is removed once the last holder releases it (see
   * `LayerManager.releaseFocus`). Optional so the exported type stays
   * backwards compatible — the engine always initializes it.
   */
  refCount?: number;
}

/**
 * Focus target state for a page (screen) layer.
 */
export interface PageFocusTarget extends BaseFocusTarget{
  /** Registered key bindings (evaluation order). */
  bindings: PageBoundKeyEntry[];
}

/**
 * Keyboard state for a single named focus target on a screen layer.
 *
 * Focus targets allow multiple form controls on the same screen to have
 * independent key bindings. Only the currently active target receives
 * events; inactive targets are skipped.
 */
export interface FocusTarget extends BaseFocusTarget {
  /** Registered key bindings (evaluation order). */
  bindings: BaseBoundKeyEntry[];
}

/**
 * The active focus entry of a group, as returned by `focusCurrent`:
 * the focused target's id plus the group it was activated from.
 */
export interface FocusResult {
  /** The id of the active focus target. */
  id: string;
  /**
   * The named group the target was activated from, or
   * {@link defaultTargetsSymbol} for the default group.
   */
  fromGroup: string | typeof defaultTargetsSymbol;
}

/**
 * Result of a `focusCurrent` lookup.
 *
 * Each call reports exactly one outcome: `noOwner` when no page, layer, or
 * modal layer is active; `noLayer` when the current owner has no keyboard
 * layer; `noFound` when the group has no active target; or `result` with
 * the active focus entry. The flags are optional (rather than a strict
 * discriminant) so callers can read `.result?.id` without narrowing.
 */
export interface FocusCurrentResult {
  /** `true` when no page, layer, or modal layer is currently active. */
  noOwner?: boolean;
  /** `true` when the current owner has no keyboard layer. */
  noLayer?: boolean;
  /** `true` when the requested group has no active focus target. */
  noFound?: boolean;
  /** The active focus entry, present when one was found. */
  result?: FocusResult;
}

/**
 * Options for focusing a specific target within a layer.
 */
export interface FocusSetOptions {
  /**
   * The focus group identifier. When set, focuses a target within a
   * specific named group rather than the default group.
   */
  group?: string;
  /**
   * The element ID within the current layer. Required when the current
   * owner is a string (layerId) to locate the specific element's keyboard
   * layer within the layer's element map.
   */
  element?: string;
}
