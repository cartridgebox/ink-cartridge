/**
 * Reference to a named focus target, optionally inside a focus group.
 *
 * A plain string refers to a target in the default focus layer; the
 * object form refers to a target inside the named group.
 */
export type FocusRef = {
  /** The name of the focus group the target belongs to. */
  group: string;
  /** The id of the target inside the group. */
  focusId: string;
};

/**
 * Options for {@link KeyboardEngine.boundSequence}.
 *
 * Extends {@link BoundKeyboardOptions} with sequence-specific settings:
 * a per-sequence timeout and an exclusive flag that controls behavior
 * when a mismatched key is pressed during a pending sequence.
 */
export interface SequenceOptions extends BoundKeyboardOptions {
  /**
   * Maximum time in milliseconds between key presses within a sequence.
   * The timer starts when the first key is pressed and resets on each
   * matching key. If it expires before the full sequence is entered, the
   * pending state is cancelled.
   *
   * @default 500
   */
  timeout?: number;

  /**
   * Controls behaviour when a key is pressed that does NOT match the
   * next key expected by a pending sequence.
   *
   * - `false` (default): the mismatched key **cancels** the pending
   *   sequence and falls through to normal `boundKeyboard` bindings.
   * - `true`: the mismatched key is **silently consumed** — the sequence
   *   keeps waiting until the timeout expires or the correct key arrives.
   *   This allows the user to correct a mistaken key without triggering
   *   side effects from normal bindings.
   */
  exclusive?: boolean;
}

/**
 * Options for {@link KeyboardEngine.boundKeyboard}.
 */
export interface BoundKeyboardOptions {
  /**
   * When set, binds the keyboard data to the element with this ID on the
   * current layer.
   */
  elementId?: string;
  /**
   * Focus target in which the binding must be active to take effect.
   * A plain string binds the key to the default focus layer; an explicit
   * group binds it to that group.
   */
  focusId?: string | FocusRef;

  /**
   * When `true`, the binding is automatically removed after its first
   * invocation. The unbind happens *before* the handler executes, so
   * even if the handler throws, the binding is consumed.
   *
   * Useful for one-shot key bindings (e.g. "press any key to continue").
   */
  once?: boolean;

  /**
   * Number of times the bound key(s) must be pressed before the handler
   * fires. Defaults to `undefined` (fire immediately on every press).
   *
   * The counter is per-binding (all keys in the `keys` array share the
   * same counter) and never auto-resets. When the counter reaches
   * `times`, the handler fires and the counter resets to 0.
   *
   * When combined with `once: true`, the binding is removed after the
   * handler fires (i.e. after `times` presses).
   *
   * Must be >= 1. Throws if 0 or negative.
   *
   * Examples:
   * - `times: 2` → handler fires on the 2nd, 4th, 6th… press.
   * - `times: 3, once: true` → handler fires on the 3rd press and unbinds.
   */
  times?: number;

  /**
   * Optional condition callback. When provided, the binding only fires if
   * this callback returns `true` at the moment of the key press.
   *
   * When `false`, the binding is skipped — the event continues to the next
   * binding or layer. This is an AND relationship with `elementId` / `focusId`.
   *
   * Examples:
   * - `when: () => isEditing` — binding only active during editing
   * - `when: () => isEditing && !isReadOnly`
   */
  when?: (() => boolean) | string;

  /**
   * Callback invoked on every key press while counting toward `times`.
   * Receives the number of remaining presses before the handler fires.
   * Requires `times` to be set; throws at registration otherwise.
   *
   * @param remaining - How many more presses are needed before the handler fires.
   */
  observer?: (remaining: number) => void;

  /**
   * Restrict this binding to a specific mode set via {@link KeyboardEngine.setMode}.
   *
   * When the active mode (read from the pipeline context) does not match
   * this value, the binding is skipped as if it does not exist — the event
   * continues to the next binding or layer. When omitted, the binding fires
   * in all modes (including no-mode, i.e. `currentMode === null`).
   *
   * Modes must be registered before use — via {@link EngineProps.modes}
   * or {@link KeyboardEngine.addMode}.
   *
   * @example
   * ```ts
   * // Only active in insert mode
   * boundKeyboard('*', handleInput, { mode: 'insert' });
   *
   * // Only active in normal mode
   * boundKeyboard('j', moveDown, { mode: 'normal' });
   *
   * // Active in all modes (default)
   * boundKeyboard('ctrl+q', quit);
   * ```
   */
  mode?: string;

  /**
   * When `true`, the binding stops responding once any layer is present
   * on screen; it only takes effect while no layers are open.
   *
   * Enabling this on a binding registered inside a layer has no effect —
   * it only works when enabled on the page. Note that when a page exists
   * without any layers and no `elementId` is passed, the option takes
   * effect and the binding data is placed on the current page.
   */
  stopsWorkingAfterLayerAppearing?: boolean;
}

/**
 * Options for {@link KeyboardEngine.stop} when stopping keys
 * within a specific focus target.
 */
export interface StopOptions {
  /** If provided, stops only within the named focus target. */
  focusId?: string | FocusRef;
  /**
   * When `true`, treats each entry in `keys` as a shortcut **action ID**
   * and resolves it to the actual key names currently bound to that action
   * (via the layer's or focus target's `actionKeysMap`).
   *
   * This keeps stopping logic decoupled from literal key names: if you
   * later rebind the action to different keys, the stop still works.
   *
   * @throws If an action ID has no bound keys (never registered or already
   *         unbound).
   */
  stopAction?: boolean;
  /**
   * Optional condition — function or registered condition id.
   * When provided, the key is only stopped (propagation barrier)
   * when this evaluates to `true`. When `false`, the stop rule is
   * ignored and the key propagates normally.
   */
  when?: (() => boolean) | string;
  /** ID of the element whose keyboard data the stop rule applies to. */
  elementId?: string;
}

/**
 * Options for `useModalMissListener`.
 *
 * Each option defaults to `false`, meaning only explicit `boundKeyboard`
 * / `boundSequence` matches (and built-in Tab navigation) count as
 * "handled". Enable flags to broaden the definition of a handled key.
 *
 * @example
 * ```ts
 * // Catch condition-gated misses
 * engine.useModalMissListener(
 *   (evt) => {
 *     if (evt.miss) showKeyHint(evt.eventNames);
 *   },
 *   { monitorWhen: true, monitorFocusMismatch: true },
 * );
 * ```
 */
export interface ModalMissOptions {
  /**
   * When `true`, a key matching a binding whose `when()` returns `false`
   * is treated as a **miss**. Default `false` (treated as handled).
   */
  monitorWhen?: boolean;

  /**
   * When `true`, a key matching a binding on a non-active focus target
   * is treated as a **miss**. Default `false` (treated as handled).
   */
  monitorFocusMismatch?: boolean;

  /** ID of the element the miss listener applies to. */
  elementId?: string;
}

/**
 * Options for {@link KeyboardEngine.penetration} when marking keys
 * as transparent within a specific focus target.
 */
export interface PenetrationOptions {
  /** If provided, penetrates only within the named focus target. */
  focusId?: string | FocusRef;
  /**
   * Optional condition callback. When provided, the key is only transparent
   * when this returns `true`. When `false`, the penetration rule
   * is ignored and the key is not passed through.
   */
  when?: (() => boolean) | string;
  /** ID of the element the penetration rule applies to. */
  elementId?: string;
}

/**
 * Options for {@link KeyboardEngine.allowModal} when allowing keys
 * to pass through the modal barrier within a specific focus target.
 */
export interface AllowModalOptions {
  /** If provided, allows only within the named focus target. */
  focusId?: string | FocusRef;
  /** Optional condition callback. When provided, the key is only allowed through when this returns `true`. When `false`, the allow rule is ignored and the key is blocked. */
  when?: (() => boolean) | string;
  /** ID of the element the allow rule applies to. */
  elementId?: string;
}
