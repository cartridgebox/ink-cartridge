import {
  setIfAbsent,
  deleteIfPresent,
  modifyEntryKeys,
} from "../providers/helpers.js";
import {
  GlobalKeyEntry,
  GlobalSequenceEntry,
  ResolvedGlobalKeyEntry,
  ResolvedGlobalSequenceEntry,
  SequenceOperationEntry,
  ShortcutOperationEntry,
} from "../types/entry.js";
import { SequenceListeningOptions } from "../types/options.js";
import { GlobalPendingSequence, PendingSequence } from "../types/pending-sequence.js";
import EngineState from "./EngineState.js";
import type LayerManager from "./LayerManager.js";

/**
 * Manages modes, conditions, wildcard priority, global keys/sequences, and
 * named shortcut/sequence actions.
 */
export default class OperationRegistry<TComponent = unknown> {
  constructor(
    private state: EngineState<TComponent>,
    private layers: LayerManager<TComponent>,
  ) {}

  /**
   * Register a new mode name. Modes segment key bindings into separate
   * contexts (like Vim's normal/insert/visual modes) and must be
   * registered before they can be set or referenced by bindings.
   *
   * @returns `true` if added, `false` if already registered.
   */
  addMode(mode: string) {
    if (this.state.modesRef.has(mode)) {
      return false;
    }
    this.state.modesRef.add(mode);
    return true;
  }

  /**
   * Unregister a mode.
   *
   * If the removed mode is currently active, the engine does NOT
   * auto-switch — call {@link setMode}(null) to exit.
   *
   * @returns `true` if the mode existed and was removed.
   */
  removeMode(mode: string) {
    return this.state.modesRef.delete(mode);
  }

  /**
   * Switch to a specific mode. Pass `null` to exit all modes (no-mode
   * state).
   *
   * @returns `true` on success, `false` if the mode is not registered.
   */
  setMode(mode: string | null) {
    if (typeof mode === "string" && !this.state.modesRef.has(mode)) {
      return false;
    }
    this.state.currentModeRef = mode;
    return true;
  }

  /**
   * Cycle to the next mode in registration order, wrapping around at the
   * end. In no-mode state, enters the first registered mode.
   */
  nextMode() {
    const modes = Array.from(this.state.modesRef);
    if (modes.length === 0) return;
    const currentIndex = modes.indexOf(this.state.currentModeRef ?? "");
    const nextIndex = (currentIndex + 1) % modes.length;
    this.state.currentModeRef = modes[nextIndex];
  }

  /**
   * Cycle to the previous mode in registration order, wrapping around at
   * the end.
   */
  prevMode() {
    const modes = Array.from(this.state.modesRef);
    if (modes.length === 0) return;
    const currentIndex = modes.indexOf(this.state.currentModeRef ?? "");
    const prevIndex = (currentIndex - 1 + modes.length) % modes.length;
    this.state.currentModeRef = modes[prevIndex];
  }

  /**
   * Return the active mode name, or `null` in no-mode state.
   *
   * The active mode is stored in `currentModeRef` and written into every
   * pipeline context as `currentMode`; each processor that evaluates
   * bindings (screen stack, global keys, global sequences, composition)
   * checks `entry.mode` against it and skips entries whose mode doesn't
   * match. Bindings without a `mode` option fire in all modes.
   */
  getCurrentMode() {
    return this.state.currentModeRef;
  }

  /**
   * Register a named boolean condition for `when: "conditionId"`
   * references.
   *
   * Unlike modes (discrete, exclusive states), conditions are independent
   * booleans that can be toggled at runtime and are evaluated per key
   * press — use them for state-driven gating like "isEditing",
   * "hasSelection", "isConnected".
   *
   * @returns `true` if registered, `false` if the id already exists.
   */
  addCondition(id: string, defaultVal: boolean) {
    if (this.state.conditions.has(id)) {
      return false;
    }
    this.state.conditions.set(id, defaultVal);
    return true;
  }

  /**
   * Unregister a condition.
   *
   * @returns `true` if it existed and was removed.
   */
  removeCondition(target: string) {
    return this.state.conditions.delete(target);
  }

  /**
   * Update a condition's value. Bindings referencing it via
   * `when: "conditionId"` use the new value on the very next key event —
   * the check is per-key-press, so no sync or cleanup is needed.
   *
   * @returns `true` if updated, `false` if the condition is not
   *          registered.
   */
  setCondition(target: string, value: boolean) {
    if (!this.state.conditions.has(target)) {
      return false;
    }
    this.state.conditions.set(target, value);
    return true;
  }

  enableWildcardPriority() {
    this.state.wildcardPriorityCountRef += 1;
    let disabled = false;
    return () => {
      if (disabled) return;
      disabled = true;
      this.state.wildcardPriorityCountRef = Math.max(
        0,
        this.state.wildcardPriorityCountRef - 1,
      );
    };
  }

  /**
   * Register global key bindings. Global keys fire independently of the
   * screen stack, subject to `category` whitelist and `affectLayer`
   * placement.
   *
   * When `operate` is a string, it is resolved here to the registered
   * shortcut action's callback (throwing if the action is not
   * registered); press-count tracking is initialized for entries with
   * `times`. `'replace'` mode (default) replaces all global keys,
   * `'add'` appends.
   *
   * @throws If `times < 1`, `observer` without `times`, or a string
   *         `operate` that names no registered shortcut action.
   */
  globalKeys(
    entries: GlobalKeyEntry[],
    options?: { mode?: "replace" | "add" },
  ) {
    const processed = entries.map((each) => {
      if (each.times !== undefined && each.times < 1) {
        throw new Error(
          "[Ink-Cartridge] globalKeys() times option must be >= 1.",
        );
      }

      if (each.times === undefined && each.observer) {
        throw new Error(
          "[Ink-Cartridge] globalKeys() observer option requires times option to be set.",
        );
      }

      if (typeof each.operate === "string") {
        const entry = this.state.shortcutOperationsRef.get(each.operate);
        if (!entry) {
          throw new Error(
            `[Ink-Cartridge]You want to call the shortcut ${each.operate} in the global key, but it is not registered`,
          );
        }

        return {
          key: each.key,
          operate: entry.action,
          cover: each.cover,
          category: each.category,
          affectLayer: each.affectLayer,
          times: each.times,
          pressCount: each.times !== undefined ? 0 : undefined,
          observer: each.observer,
          executeWhenNoOverlay: each.executeWhenNoOverlay,
          when: each.when,
          mode: each.mode,
        };
      }
      return {
        key: each.key,
        operate: each.operate,
        cover: each.cover,
        category: each.category,
        affectLayer: each.affectLayer,
        times: each.times,
        pressCount: each.times !== undefined ? 0 : undefined,
        observer: each.observer,
        executeWhenNoOverlay: each.executeWhenNoOverlay,
        when: each.when,
        mode: each.mode,
      };
    });

    if (options?.mode === "add") {
      this.state.globalKeysRef = [...this.state.globalKeysRef, ...processed];
    } else {
      this.state.globalKeysRef = processed;
    }
  }

  getGlobalKeys(): ResolvedGlobalKeyEntry[] {
    return this.state.globalKeysRef;
  }

  getGlobalSequences(): ResolvedGlobalSequenceEntry[] {
    return [...this.state.globalSequencesRef];
  }

  getGlobalPendingSequence(): GlobalPendingSequence | null {
    return this.state.globalPendingSeqRef;
  }

  /**
   * Register global sequence key bindings. Global sequences fire
   * independently of the screen stack with higher priority than global
   * keys, matching multi-key sequences instead of single presses.
   *
   * When `operate` is a string, it is resolved here to the registered
   * sequence action's callback (throwing if the action is not
   * registered). In `'replace'` mode (default), any active pending global
   * sequence is cancelled before replacement.
   *
   * @throws If any sequence has fewer than 2 keys, or a string `operate`
   *         names no registered sequence action.
   */
  globalSequence(
    entries: GlobalSequenceEntry[],
    options?: { mode?: "replace" | "add" },
  ) {
    const resolved: ResolvedGlobalSequenceEntry[] = entries.map((entry) => {
      if (typeof entry.operate === "string") {
        const actionEntry = this.state.sequenceOperationsRef.get(entry.operate);
        if (!actionEntry) {
          throw new Error(
            `[Ink-Cartridge] You want to call the sequence action "${entry.operate}" in globalSequence, but it is not registered.`,
          );
        }
        return { ...entry, operate: actionEntry.action };
      }
      return { ...entry, operate: entry.operate };
    });

    for (const entry of resolved) {
      if (entry.keys.length < 2) {
        throw new Error(
          "[Ink-Cartridge] globalSequence() requires at least 2 keys per sequence.",
        );
      }
    }

    if (options?.mode === "add") {
      this.state.globalSequencesRef = [
        ...this.state.globalSequencesRef,
        ...resolved,
      ];
    } else {
      if (this.state.globalPendingSeqRef) {
        clearTimeout(this.state.globalPendingSeqRef.timer);
        this.state.globalPendingSeqRef = null;
      }
      this.state.globalSequencesRef = resolved;
    }
  }

  /**
   * Register named shortcut actions that key bindings can reference by
   * string id instead of inline callbacks.
   *
   * Decouples key bindings from callback logic: register an action once
   * and reference it by `actionId` everywhere, so keys can be changed
   * without touching every binding site. The stored callback is resolved
   * to a stable reference at registration time (when `boundKeyboard` /
   * `globalKeys` receives a string `operate`), not at key-press time.
   *
   * @example
   * ```ts
   * engine.defineShortcutAction([
   *   { actionId: 'save', action: () => saveFile(), keys: ['ctrl+s'] },
   *   { actionId: 'quit', action: () => process.exit(0), keys: ['ctrl+q'] },
   *   { actionId: 'help', action: () => toggleHelp() },
   * ]);
   *
   * // Reference by id everywhere
   * engine.boundKeyboard('save');                     // uses preset keys
   * engine.boundKeyboard('f9', 'save');               // overrides keys locally
   * engine.globalKeys([{ key: 'ctrl+s', operate: 'save' }]);
   * ```
   *
   * @returns `true` if every entry was registered; `false` if any `actionId`
   *          already existed (or repeats within the batch). On `false` nothing
   *          is registered — the batch is atomic.
   */
  defineShortcutAction(entries: ShortcutOperationEntry[]): boolean {
    const map = this.state.shortcutOperationsRef;
    const seen = new Set<string>();
    for (const each of entries) {
      if (seen.has(each.actionId) || map.has(each.actionId)) return false;
      seen.add(each.actionId);
    }
    for (const each of entries) {
      map.set(each.actionId, { action: each.action, keys: each.keys });
    }
    return true;
  }

  /**
   * Register named sequence actions that `boundSequence` and
   * `globalSequence` can reference by `sequenceActionId`.
   *
   * The sequence counterpart to {@link defineShortcutAction}. The stored
   * callback is resolved at registration time, not at key-press time.
   *
   * @example
   * ```ts
   * engine.defineSequenceAction([
   *   { sequenceActionId: 'scroll-top', action: () => scrollToTop(), keys: ['g', 'g'], timeout: 600 },
   * ]);
   *
   * engine.boundSequence('scroll-top');               // uses preset keys
   * engine.boundSequence(['shift+g'], 'scroll-top');  // overrides keys locally
   * engine.globalSequence([{ keys: ['ctrl+home'], operate: 'scroll-top' }]);
   * ```
   *
   * @returns `true` if every entry was registered; `false` if any
   *          `sequenceActionId` already existed (or repeats within the batch).
   *          On `false` nothing is registered — the batch is atomic.
   */
  defineSequenceAction(entries: SequenceOperationEntry[]): boolean {
    const map = this.state.sequenceOperationsRef;
    const seen = new Set<string>();
    for (const each of entries) {
      if (seen.has(each.sequenceActionId) || map.has(each.sequenceActionId)) {
        return false;
      }
      seen.add(each.sequenceActionId);
    }
    for (const each of entries) {
      map.set(each.sequenceActionId, {
        action: each.action,
        keys: each.keys,
        timeout: each.timeout,
      });
    }
    return true;
  }

  /**
   * Change the preset keys and/or timeout of an existing sequence action.
   *
   * @returns `true` if modified; `false` if the action does not exist, was
   *          registered without a `keys` field, or (when `timeout` is passed)
   *          has no default timeout.
   */
  modifySequenceAction(
    actionId: string,
    keys: string[],
    timeout?: number,
  ): boolean {
    const entry = modifyEntryKeys(
      this.state.sequenceOperationsRef,
      actionId,
      keys,
    );
    if (!entry) return false;
    if (timeout) {
      if (entry.timeout === undefined) return false;
      entry.timeout = timeout;
    }
    return true;
  }

  /**
   * Change the preset keys of an existing shortcut action.
   *
   * @returns `true` if modified; `false` if the action does not exist or was
   *          registered without a `keys` field.
   */
  modifyAction(actionId: string, keys: string[]): boolean {
    return (
      modifyEntryKeys(this.state.shortcutOperationsRef, actionId, keys) !==
      undefined
    );
  }

  /**
   * Add a single sequence action.
   *
   * @returns `true` if added, `false` if the `sequenceActionId` already exists.
   */
  addSequenceAction(entry: SequenceOperationEntry): boolean {
    return setIfAbsent(this.state.sequenceOperationsRef, entry.sequenceActionId, {
      action: entry.action,
      keys: entry.keys,
      timeout: entry.timeout,
    });
  }

  /** Check sequence action registration without throwing. */
  hasSequenceAction(sequenceActionId: string): boolean {
    return this.state.sequenceOperationsRef.has(sequenceActionId);
  }

  /**
   * Remove a registered sequence action.
   *
   * @returns `true` if it existed and was removed, `false` otherwise.
   */
  removeSequenceAction(sequenceActionId: string): boolean {
    return deleteIfPresent(this.state.sequenceOperationsRef, sequenceActionId);
  }

  /** Remove all registered sequence actions. */
  clearSequenceOperations() {
    this.state.sequenceOperationsRef.clear();
  }

  /**
   * Add a single shortcut action.
   *
   * @returns `true` if added, `false` if the `actionId` already exists.
   */
  addAction(entry: ShortcutOperationEntry): boolean {
    return setIfAbsent(this.state.shortcutOperationsRef, entry.actionId, {
      action: entry.action,
      keys: entry.keys,
    });
  }

  /** Check shortcut action registration without throwing. */
  hasAction(actionId: string): boolean {
    return this.state.shortcutOperationsRef.has(actionId);
  }

  /**
   * Remove a registered shortcut action.
   *
   * @returns `true` if it existed and was removed, `false` otherwise.
   */
  removeAction(actionId: string): boolean {
    return deleteIfPresent(this.state.shortcutOperationsRef, actionId);
  }

  /** Remove all registered shortcut actions. */
  clearShortcutOperations() {
    this.state.shortcutOperationsRef.clear();
  }

  /**
   * Check whether a global multi-key sequence is currently pending
   * (i.e. the first key was pressed and the engine is waiting for
   * subsequent keys or a timeout).
   *
   * When `sync` is provided, it is registered as a pending-sync callback
   * and notified after each {@link processKey} so the host framework can
   * re-render.
   */
  thereGlobalQueueWaiting(sync?: () => void): boolean {
    if (sync) {
      this.state.pendingSyncs.add(sync);
    }
    return this.state.globalPendingSeqRef !== null;
  }

  /**
   * Check whether the current owner's layer has an active pending
   * multi-key sequence (registered via `boundSequence`).
   *
   * Unlike {@link thereGlobalQueueWaiting}, this only checks the layer
   * belonging to the current owner. With `options.monitorLayer: true`,
   * a layer-id owner's own pending sequence is inspected; otherwise the
   * top page's pending sequence is used.
   *
   * @throws If there is no current owner (no active page, layer, or
   *         modal layer).
   */
  currentScreenHasSequenceWaiting(
    sync?: () => void,
    options?: SequenceListeningOptions,
  ): boolean {
    if (sync) {
      this.state.pendingSyncs.add(sync);
    }

    const owner = this.layers.getCurrentOwner();

    if (!owner) {
      throw new Error(
        "[Ink-Cartridge] currentScreenHasSequenceWaiting() must be called inside a screen component or overlay. There is currently no active screen.",
      );
    }

    let pending: PendingSequence | null = null;

    if (options?.monitorLayer === true && typeof owner === "string") {
      const seq = this.state.layersKeyboardMap.get(owner)
      if (seq) {
        pending = seq.pendingSequence.pendingSequence
      }
    } else if (typeof owner !== "string") {
      pending = this.layers.getLayer(owner).pendingSequence;
      
    } else {
      const topC = this.layers.getTopPage();

      if (!topC) {
        throw new Error(
          `
								[keyboard-engine] currentScreenHasSequenceWaiting(): You have not enabled the option to listen for layers, yet there are currently no pages; 
                you must enable this option, or else register a new page.

                enable option:
                currentScreenHasSequenceWaiting(sync, {
                  monitorLayer: true
                })

                Create a registration page: Determined by the framework host.

							`,
        );
      }

      pending = this.layers.getLayer(topC).pendingSequence;
    }

    return (
      pending !== null && pending !== undefined
    );
  }
}
