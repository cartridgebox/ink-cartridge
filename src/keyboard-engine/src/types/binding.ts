import { SequenceOptions } from "./options.js";

/**
 * Keyboard callback, matching Ink's `useInput` signature.
 *
 * @param input  The raw character string (empty for special keys).
 * @param key    The key descriptor (booleans for special keys, modifiers).
 */
export type KeyHandler = (input: string, key: unknown) => void;

/**
 * A single key-binding entry stored on a screen layer or focus target.
 */
export interface BaseBoundKeyEntry {
  /** Normalized key names to match. */
  keys: string[];
  /** Handler to invoke on match. */
  handler: KeyHandler;
  /** Number of presses needed before the handler fires (from options). */
  times?: number;
  /** Current press count. Managed internally by the keyboard provider. */
  pressCount?: number;
  /**
   * Optional condition callback. When provided, the binding only fires if
   * this callback returns `true` at the moment of the key press.
   *
   * When `false`, the binding is skipped as if it does not exist — the
   * event continues to the next binding or layer.
   */
  when?: (() => boolean) | string;
  /**
   * Callback invoked on every key press while counting toward `times`.
   * Receives the number of remaining presses before the handler fires.
   * Requires `times` to be set; throws at registration otherwise.
   */
  observer?: (remaining: number) => void;
  /**
   * Restrict this binding to a specific mode.
   *
   * Copied from {@link BoundKeyboardOptions.mode} at registration time.
   * Checked by {@link tryMatchBindings} before `when`, `onlyThis`, and
   * key-match evaluation. When the active mode does not match, the binding
   * is skipped entirely.
   */
  mode?: string;

  /**
   * The shortcut action id this binding was registered through, when the
   * handler was given as an id rather than a callback.
   *
   * Kept so the action-key map can be cleaned up per registration: the
   * resolved callback alone cannot tell which action a key belongs to, and a
   * key may be bound by several actions at once.
   */
  actionId?: string;
}

/**
 * A key binding registered on a page (screen) layer.
 *
 * Extends {@link BaseBoundKeyEntry} with the page-only
 * `stopsWorkingAfterLayerAppearing` option.
 */
export interface PageBoundKeyEntry extends BaseBoundKeyEntry {
  /**
   * When `true`, this binding stops responding after its owning layer
   * has appeared on screen. The binding is only active before the layer
   * renders for the first time — once the layer becomes visible, any
   * subsequent key presses matching this entry are silently ignored.
   */
  stopsWorkingAfterLayerAppearing?: boolean;
}

/**
 * A registered multi-key sequence binding.
 *
 * Stored in `ScreenKeyboardLayer.sequences`, keyed by the first
 * key in the sequence. When that key is pressed and no other sequence
 * is already pending, the layer enters a pending state waiting for the
 * remaining keys.
 */
export interface BaseSequenceBinding {
  /**
   * Ordered key names making up the full sequence.
   * Must have length ≥ 2 (the first key is the lookup key in the map).
   */
  keys: string[];

  /** Callback to invoke when the full sequence is matched. */
  handler: KeyHandler;
  /**
   * Per-binding timeout override (ms). Falls back to the global
   * `DEFAULT_SEQUENCE_TIMEOUT` (500 ms) when omitted.
   */
  timeout?: number;

  /** Binding options (exclusive mode, focusId, onlyThis, etc.). */
  options?: SequenceOptions;
  /**
   * Optional condition callback (extracted from options.when at registration).
   * When provided, the sequence only starts and continues when this returns `true`.
   */
  when?: (() => boolean) | string;
}

/**
 * Sequence options for bindings registered on a page (screen) layer.
 *
 * Extends {@link SequenceOptions} with the page-only
 * `stopsWorkingAfterLayerAppearing` option.
 */
export interface PageSequenceOptions extends SequenceOptions {
  /**
   * When `true`, this binding stops responding after its owning layer
   * has appeared on screen. The binding is only active before the layer
   * renders for the first time — once the layer becomes visible, any
   * subsequent key presses matching this entry are silently ignored.
   */
  stopsWorkingAfterLayerAppearing: boolean;
}

/**
 * A sequence binding registered on a page (screen) layer.
 *
 * Extends {@link BaseSequenceBinding} with page-only options.
 */
export interface PageSequenceBinding extends BaseSequenceBinding {
  /** Binding options (exclusive mode, focusId, onlyThis, etc.). */
  options?: PageSequenceOptions;
}
