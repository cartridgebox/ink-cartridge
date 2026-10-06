import {
  KeyRuleContainer,
  finalizeBoundKeyboard,
  pushKeyEntries,
} from "../providers/helpers.js";
import {
  BaseBoundKeyEntry,
  KeyHandler,
  BaseSequenceBinding,
  PageBoundKeyEntry,
  PageSequenceBinding,
  PageSequenceOptions,
} from "../types/binding.js";
import { ModalMissCallback } from "../types/modal.js";
import {
  AllowModalOptions,
  BoundKeyboardOptions,
  ModalMissOptions,
  PenetrationOptions,
  SequenceOptions,
  StopOptions,
} from "../types/options.js";
import { ElementKeyboard, PageKeyboardLayer } from "../types/page-layer.js";
import EngineState from "./EngineState.js";
import LayerManager from "./LayerManager.js";

/**
 * Resolves keyboard bindings against the current owner's layer: key
 * bindings, penetration, stop barriers, modal allow-lists, and multi-key
 * sequences.
 */
export default class BindingService<TComponent = unknown> {
  constructor(
    private state: EngineState<TComponent>,
    private layers: LayerManager<TComponent>,
  ) {}

  private getKeyboardInCurrentContext(
    owner: string | TComponent,
    elementId?: string,
  ) {
    let layer: PageKeyboardLayer | ElementKeyboard;
    if (typeof owner === "string" && elementId) {
      layer = this.layers.getLayer(owner, elementId);
    } else if (typeof owner !== "string" && !elementId) {
      layer = this.layers.getLayer(owner);
    } else {
      const topComponent = this.layers.getTopPage();

      if (!topComponent) {
        throw new Error(
          `
          [keyboard-engine] getKeyboardInCurrentContext(): No Page currently exists, but a Layer does. You must provide an elementId, or register it
  		`,
        );
      }

      layer = this.layers.getLayer(topComponent);
    }
    return layer;
  }

  /**
   * Bind one or more keys to a handler on the current owner's layer.
   *
   * Supports three calling conventions:
   * 1. `boundKeyboard(keys, handler, options?)` — explicit keys and callback
   * 2. `boundKeyboard(keys, actionId, options?)` — explicit keys, shortcut
   *    action by id (resolved to its stored callback at registration time)
   * 3. `boundKeyboard(actionId, options?)` — uses the action's preset keys
   *
   * With a `focusId` option the binding is stored on that focus target
   * (created lazily) instead of the layer-level bucket. Bindings are also
   * checked against registered global keys: binding a key already declared
   * in `globalKeys` marks it as overridden on the layer — unless the
   * global entry has `cover: false`, which throws.
   *
   * @example
   * ```ts
   * engine.defineShortcutAction([
   *   { actionId: 'submit', action: handleSubmit, keys: ['ctrl+enter'] },
   * ]);
   * engine.boundKeyboard('submit');          // uses preset keys
   * engine.boundKeyboard('f5', 'submit');    // overrides keys locally
   * ```
   *
   * @returns An unbind function.
   * @throws If no current owner exists, the action id is not registered,
   *         `times < 1`, `observer` without `times`, or a `cover: false`
   *         global key conflict.
   */
  boundKeyboard(
    keysOrActionId: string | string[],
    handlerOrOptions: KeyHandler | string | BoundKeyboardOptions,
    maybeOptions?: BoundKeyboardOptions,
  ): () => void {
    const createBoundKeyEntry = (
      keys: string[],
      handler: KeyHandler | string,
    ): BaseBoundKeyEntry | PageBoundKeyEntry => {
      if (typeof handler === "string") {
        const entry = this.state.shortcutOperationsRef.get(handler);
        if (!entry) {
          throw new Error(
            `[keyboard-engine] The shortcut key you used does not exist with ID ${handler}`,
          );
        }
        return { keys, handler: entry.action };
      }
      return { keys, handler };
    };

    // Validate the binding against registered global keys and return the key
    // names it overrides. Pure: the overrides are applied by the caller only
    // once the entry is built, so a throw (unknown actionId, or a cover: false
    // conflict) can no longer leave a stray override that suppresses the
    // global key for good.
    const collectGlobalKeyOverrides = (
      keys: string[],
      owner: TComponent | string,
      bindingContext: string,
    ): string[] => {
      const overrides: string[] = [];
      for (const gk of this.state.globalKeysRef) {
        const gkKeys = Array.isArray(gk.key) ? gk.key : [gk.key];
        const matchingKeys = gkKeys.filter((k) => keys.includes(k));
        if (matchingKeys.length === 0) continue;

        const isOverlayOwner = typeof owner === "string";
        const cat = gk.category;
        let inCategory = false;

        if (!isOverlayOwner) {
          if (cat === undefined || cat === "*") {
            inCategory = true;
          } else if (Array.isArray(cat)) {
            inCategory = cat.includes(owner);
          }
          if (!inCategory) continue;
        }

        const cover = gk.cover ?? true;
        const affectOverlay = gk.affectLayer ?? false;

        if (isOverlayOwner) {
          if (!affectOverlay) continue;
          if (!cover) {
            throw new Error(
              `[keyboard-engine] Overlay "${owner}" ` +
                `attempted to bind "${matchingKeys[0]}" via ${bindingContext}, ` +
                `but this key is already declared in globalKeys with cover: false, so overriding is not allowed.`,
            );
          }
        } else {
          if (affectOverlay) continue;
          if (!cover) {
            const ownerName =
              (owner as any).displayName || (owner as any).name || "anonymous";
            throw new Error(
              `[keyboard-engine] Component "${ownerName}" ` +
                `attempted to bind "${matchingKeys[0]}" via ${bindingContext}, ` +
                `but this key is already declared in globalKeys with cover: false, so overriding is not allowed.`,
            );
          }
        }

        overrides.push(...matchingKeys);
      }
      return overrides;
    };

    if (
      typeof keysOrActionId === "string" &&
      typeof handlerOrOptions !== "function" &&
      typeof handlerOrOptions !== "string"
    ) {
      const actionId = keysOrActionId;
      const options = handlerOrOptions;
      const entry = this.state.shortcutOperationsRef.get(actionId);
      if (!entry) {
        throw new Error(
          `[keyboard-engine] Action "${actionId}" is not registered.`,
        );
      }
      if (!entry.keys || entry.keys.length === 0) {
        throw new Error(
          `[keyboard-engine] Action "${actionId}" does not have predefined keys. Please register with keys field or call boundKeyboard with explicit keys.`,
        );
      }
      return this.boundKeyboard(entry.keys, actionId, options);
    }

    const keys = Array.isArray(keysOrActionId)
      ? keysOrActionId
      : [keysOrActionId];
    const handler = handlerOrOptions as KeyHandler | string;
    const options = maybeOptions;

    const owner = this.layers.getCurrentOwner();
    if (!owner) {
      throw new Error(
        "[keyboard-engine] boundKeyboard() must be called inside a screen component or overlay. There is currently no active screen.",
      );
    }

    if (options?.times !== undefined && options.times < 1) {
      throw new Error(
        "[keyboard-engine] boundKeyboard() times option must be >= 1.",
      );
    }

    if (options?.times === undefined && options?.observer) {
      throw new Error(
        "[keyboard-engine] boundKeyboard() observer option requires times option to be set.",
      );
    }

    const layer = this.getKeyboardInCurrentContext(owner, options?.elementId);
    if (options?.focusId) {
      const fid = options.focusId;
      const target =
        typeof fid === "string"
          ? this.layers.getOrCreateFocusTarget(layer, fid)
          : this.layers.getOrCreateFocusTarget(layer, fid.focusId, fid.group);

      const overrides = collectGlobalKeyOverrides(keys, owner, `focusId="${fid}"`);

      const entry = createBoundKeyEntry(keys, handler);
      entry.when = options?.when;
      entry.mode = options?.mode;

      target.bindings.push(entry);
      for (const k of overrides) layer.globalKeyOverrides.add(k);

      return finalizeBoundKeyboard(
        target.bindings,
        target.actionKeysMap,
        layer,
        entry,
        handler,
        keys,
        options,
      );
    }

    const overrides = collectGlobalKeyOverrides(keys, owner, "boundKeyboard");

    const entry = createBoundKeyEntry(keys, handler);
    entry.when = options?.when;
    entry.mode = options?.mode;

    if ("associatedLayer" in layer) {
      layer.bindings.push(entry);
    } else {
      (entry as PageBoundKeyEntry).stopsWorkingAfterLayerAppearing =
        options?.stopsWorkingAfterLayerAppearing;
      layer.bindings.push(entry);
    }
    for (const k of overrides) layer.globalKeyOverrides.add(k);

    return finalizeBoundKeyboard(
      layer.bindings,
      layer.actionKeysMap,
      layer,
      entry,
      handler,
      keys,
      options,
    );
  }

  penetration(keys: string[], options?: PenetrationOptions): () => void {
    const owner = this.layers.getCurrentOwner();
    if (!owner) {
      throw new Error(
        "[keyboard-engine] penetration() must be called inside a screen component or overlay.",
      );
    }
    const layer = this.getKeyboardInCurrentContext(owner, options?.elementId);
    const compiledWhen = options?.when;

    const container: KeyRuleContainer = options?.focusId
      ? typeof options.focusId === "string"
        ? this.layers.getOrCreateFocusTarget(layer, options.focusId)
        : this.layers.getOrCreateFocusTarget(
            layer,
            options.focusId.focusId,
            options.focusId.group,
          )
      : layer;

    return pushKeyEntries(container, "penetrationKeys", keys, (key) => ({
      key,
      when: compiledWhen,
    }));
  }

  stop(keys: string[], options?: StopOptions): () => void {
    const owner = this.layers.getCurrentOwner();
    if (!owner) {
      throw new Error(
        "[keyboard-engine] stop() must be called inside a screen component or overlay.",
      );
    }
    const layer = this.getKeyboardInCurrentContext(owner, options?.elementId);

    let effectiveKeys: string[] = keys;
    if (options?.stopAction) {
      const map = options.focusId
        ? (typeof options.focusId === "string"
            ? this.layers.getOrCreateFocusTarget(layer, options.focusId)
            : this.layers.getOrCreateFocusTarget(
                layer,
                options.focusId.focusId,
                options.focusId.group,
              )
          ).actionKeysMap
        : layer.actionKeysMap;
      const merged: string[] = [];
      const ownerName =
        typeof owner === "string"
          ? owner
          : (owner as any).displayName || (owner as any).name || "Unknown";
      for (const actionId of keys) {
        const boundKeys = map.get(actionId);
        if (!boundKeys) {
          throw new Error(
            `[keyboard-engine] stop(["${actionId}"], { stopAction: true }) on "${ownerName}": ` +
              `action "${actionId}" is not registered or has no keys bound. ` +
              `Register it with defineShortcutAction() and bind it with boundKeyboard() first.`,
          );
        }
        for (const k of boundKeys) {
          if (!merged.includes(k)) merged.push(k);
        }
      }
      effectiveKeys = merged;
    }

    const compiledWhen = options?.when;

    const container: KeyRuleContainer = options?.focusId
      ? typeof options.focusId === "string"
        ? this.layers.getOrCreateFocusTarget(layer, options.focusId)
        : this.layers.getOrCreateFocusTarget(
            layer,
            options.focusId.focusId,
            options.focusId.group,
          )
      : layer;

    return pushKeyEntries(container, "stoppedKeys", effectiveKeys, (key) => ({
      key,
      when: compiledWhen,
    }));
  }

  allowModal(keys: string[], options?: AllowModalOptions): () => void {
    const owner = this.layers.getCurrentOwner();
    if (!owner) {
      throw new Error(
        "[keyboard-engine] allowModal() must be called inside a modal component.",
      );
    }
    const layer = this.getKeyboardInCurrentContext(owner, options?.elementId);

    if ("pendingSequence" in layer) {
      throw new Error(
        "[keyboard-engine] allowModal() must be called inside a modal component.",
      );
    }

    const container: KeyRuleContainer = options?.focusId
      ? typeof options.focusId === "string"
        ? this.layers.getOrCreateFocusTarget(layer, options.focusId)
        : this.layers.getOrCreateFocusTarget(
            layer,
            options.focusId.focusId,
            options.focusId.group,
          )
      : layer;

    return pushKeyEntries(container, "allowedKeys", keys, (key) => ({
      key,
      when: options?.when,
    }));
  }

  boundSequence(
    keysOrActionId: string[] | string,
    handlerOrOptions?: KeyHandler | string | SequenceOptions,
    maybeOptions?: SequenceOptions,
  ): () => void {
    if (typeof keysOrActionId !== "string" && typeof handlerOrOptions === "string") {
      const actionId = handlerOrOptions
      const options = maybeOptions
      const entry = this.state.sequenceOperationsRef.get(actionId)
      if (!entry) {
        throw new Error(
          `[keyboard-engine] boundSequence(${JSON.stringify(keysOrActionId)}, ${actionId}, ${options ? JSON.stringify(options) : "undefined"}): Sequence action "${actionId}" is not registered.`,
        );
      }

      const mergedOptions: SequenceOptions = {
        ...(entry.timeout === undefined ? {} : { timeout: entry.timeout }),
        ...options
      }

      // Because this overload branch does not depend on the preset keys of the action, 
      // we do not need to check whether their preset keys exist or their lengths.

      return this.boundSequence(keysOrActionId, entry.action, mergedOptions)
    }

    if (
      typeof keysOrActionId === "string" &&
      (typeof handlerOrOptions === "undefined" ||
        typeof handlerOrOptions === "object")
    ) {
      const actionId = keysOrActionId;
      const options = handlerOrOptions as SequenceOptions | undefined;
      const entry = this.state.sequenceOperationsRef.get(actionId);
      if (!entry) {
        throw new Error(
          `[keyboard-engine] boundSequence(${JSON.stringify(keysOrActionId)}, ${actionId}, ${options ? JSON.stringify(options) : "undefined"}): Sequence action "${actionId}" is not registered.`,
        );
      }
      if (!entry.keys || entry.keys.length === 0) {
        throw new Error(
          `[keyboard-engine] Sequence action "${actionId}" does not have predefined keys. Please register with a keys field or call boundSequence with explicit keys.`,
        );
      }
      const mergedOptions: SequenceOptions = {
        ...(entry.timeout !== undefined ? { timeout: entry.timeout } : {}),
        ...options,
      };
      return this.boundSequence(entry.keys, entry.action, mergedOptions);
    }

    const keys = Array.isArray(keysOrActionId)
      ? keysOrActionId
      : [keysOrActionId];
    const handler = handlerOrOptions as KeyHandler;
    const options = maybeOptions;

    const owner = this.layers.getCurrentOwner();
    if (!owner) {
      throw new Error(
        "[keyboard-engine] boundSequence() must be called inside a screen component or overlay.",
      );
    }
    if (keys.length < 2) {
      throw new Error(
        "[keyboard-engine] boundSequence() requires at least 2 keys in the sequence.",
      );
    }

    const isOverlayOwner = typeof owner === "string";
    const firstKey = keys[0];
    for (const gs of this.state.globalSequencesRef) {
      if (gs.cover !== false) continue;
      if (gs.keys[0] !== firstKey) continue;
      if (isOverlayOwner) {
        if (!(gs.affectLayer ?? false)) continue;
      } else {
        const cat = gs.category;
        if (cat !== undefined && cat !== "*") {
          if (Array.isArray(cat) && !cat.includes(owner)) continue;
        }
      }
      const ownerName = isOverlayOwner
        ? owner
        : (owner as any).displayName || (owner as any).name || "anonymous";
      throw new Error(
        `[keyboard-engine] ${isOverlayOwner ? `Overlay "${ownerName}"` : `Component "${ownerName}"`} ` +
          `attempted to bind sequence [${keys.join(", ")}] via boundSequence, ` +
          `but the first key "${firstKey}" is already declared in globalSequence ` +
          `with cover: false, so overriding is not allowed.`,
      );
    }

    const layer = this.getKeyboardInCurrentContext(owner, options?.elementId);

    // A focusId on a sequence binding must create the focus target (and
    // auto-activate it when it is the layer's first) — otherwise the
    // sequence's focus filtering never matches: currentFocusIds stays empty
    // and focusSet/focusCurrent cannot resolve the id. boundKeyboard already
    // does this via getOrCreateFocusTarget; sequences only referenced the id.
    if (options?.focusId) {
      const fid = options.focusId;
      if (typeof fid === "string") {
        this.layers.getOrCreateFocusTarget(layer, fid);
      } else {
        this.layers.getOrCreateFocusTarget(layer, fid.focusId, fid.group);
      }
    }

    let binding: BaseSequenceBinding | PageSequenceBinding;

    if ("associatedLayer" in layer) {
      binding = {
        keys,
        handler,
        timeout: options?.timeout,
        options,
        when: options?.when,
      };
      const existing = layer.sequences.get(firstKey) || [];
      existing.push(binding);
      layer.sequences.set(firstKey, existing);
    } else {
      // stopsWorkingAfterLayerAppearing is runtime-determined; safe cast.
      const pageBinding: PageSequenceBinding = {
        keys,
        handler,
        timeout: options?.timeout,
        options: options as PageSequenceOptions | undefined,
        when: options?.when,
      };
      binding = pageBinding;
      const existing = layer.sequences.get(firstKey) || [];
      existing.push(pageBinding);
      layer.sequences.set(firstKey, existing);
    }

    return () => {
      const arr = layer.sequences.get(firstKey);
      if (arr) {
        const idx = arr.indexOf(binding);
        if (idx !== -1) arr.splice(idx, 1);
        if (arr.length === 0) layer.sequences.delete(firstKey);
      }
    };
  }

  /**
   * Subscribe to unhandled key presses inside a modal.
   *
   * When a modal is active, the modal processor consumes every key event —
   * but some keys match no binding, sequence, or navigation rule on the
   * modal layer. This listener fires for those "misses" so the modal can
   * react to unknown keys (e.g. show a "key not bound" hint). The callback
   * receives `{ miss: false }` when the key was handled, or
   * `{ miss: true, key, input, eventNames }` when nothing consumed it.
   *
   * Sets `onMiss` / `onMissOptions` on the modal layer's element keyboard;
   * the modal processor invokes the callback during each key evaluation.
   * With `monitorWhen: true`, a key matching a binding whose `when()`
   * returns `false` counts as a miss (default: counted as handled); with
   * `monitorFocusMismatch: true`, a key matching a binding on a
   * non-active focus target counts as a miss.
   *
   * @returns An unsubscribe function.
   * @throws If not called on a modal layer (element keyboard).
   */
  useModalMissListener(
    cb: ModalMissCallback,
    options?: ModalMissOptions,
  ): () => void {
    const owner = this.layers.getCurrentOwner();
    if (typeof owner !== "string") return () => {};

    const keyboard = this.getKeyboardInCurrentContext(
      owner,
      options?.elementId,
    );
    const isLayer = "associatedLayer" in keyboard;

    if (isLayer) {
      keyboard.missListener = {
        onMiss: cb,
        onMissOptions: options ?? {},
      };
    } else {
      throw new Error(
        `
			[keyboard-engine] useModalMissListener(): It cannot be used outside of a layer.
			While you can call this method within a layer,
			it will not take effect; it only becomes truly active when the modalLayer appears.
			`,
      );
    }

    return () => {
      if (keyboard.missListener.onMiss === cb) {
        keyboard.missListener = { onMiss: null, onMissOptions: null };
      }
    };
  }
}
