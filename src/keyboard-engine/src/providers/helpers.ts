import type {
  BaseBoundKeyEntry,
  KeyHandler,
} from '../types/binding.js';
import type { BoundKeyboardOptions } from '../types/options.js';
import type { KeyRule } from '../types/key-rule.js';
import type {
  ElementKeyboard,
  PageKeyboardLayer,
} from '../types/page-layer.js';

type KeyboardLayerWithBindings = PageKeyboardLayer | ElementKeyboard;

/**
 * Remove keys from `ScreenKeyboardLayer.globalKeyOverrides` when no
 * bindings (screen-level or focus-target) still reference them.
 * Keeps the override set consistent after unbind operations.
 */
export function cleanupGlobalKeyOverrides(
  layer: KeyboardLayerWithBindings,
  keys: string[],
): void {
  for (const k of keys) {
    let stillBound =
      layer.bindings.some(b => b.keys.includes(k));
    if (!stillBound) {
      for (const group of layer.focusTargets.values()) {
        for (const ft of group.map.values()) {
          if (ft.bindings.some(b => b.keys.includes(k))) {
            stillBound = true;
            break;
          }
        }
        if (stillBound) break;
      }
    }
    if (!stillBound) {
      for (const ft of layer.defaultTargets.values()) {
        if (ft.bindings.some(b => b.keys.includes(k))) {
          stillBound = true;
          break;
        }
      }
    }
    if (!stillBound) {
      layer.globalKeyOverrides.delete(k);
    }
  }
}

/**
 * Remove specific keys from an action's entry in the actionKeysMap.
 * If no keys remain for the action after removal, the entire entry is deleted.
 *
 * Used during unbind to keep the map consistent with the current bindings.
 */
export function removeKeysFromActionMap(
  map: Map<string, string[]>,
  actionId: string,
  keysToRemove: string[],
) {
  const arr = map.get(actionId);
  if (!arr) return;
  const filtered = arr.filter(k => !keysToRemove.includes(k));
  if (filtered.length === 0) {
    map.delete(actionId);
  } else {
    map.set(actionId, filtered);
  }
}

/**
 * Minimal shape shared by {@link ScreenKeyboardLayer} and {@link FocusTarget}
 * — any object that holds `allowedKeys`, `penetrationKeys`, and `stoppedKeys`
 * as {@link KeyRule} arrays.
 */
export interface KeyRuleContainer {
  /** Key rules marked as transparent (pass-through to lower layers or focus targets). */
  penetrationKeys: KeyRule[];
  /** Key rules stopped here (propagation barrier). */
  stoppedKeys: KeyRule[];
  /** Keys allowed to pass through the modal barrier (present on modal elements). */
  allowedKeys?: KeyRule[]
}

/**
 * Push key entries into a rule array on `container`, deduplicating by key
 * name, and return a cleanup function that removes exactly the entries that
 * were added by this call.
 *
 * Used by `allowModal`, `penetration`, and `stop` to
 * eliminate the repeated bookkeeping pattern across focus-target and
 * layer-level branches.
 *
 * @param container   The object holding the target array (a layer or focus target).
 * @param property    Which array to operate on.
 * @param keys        Normalized key names to add.
 * @param createEntry Factory that builds a {@link KeyRule} for a given key.
 * @returns           A cleanup callback that removes the added entries.
 */
export function pushKeyEntries(
  container: KeyRuleContainer,
  property: 'penetrationKeys' | 'stoppedKeys' | "allowedKeys",
  keys: string[],
  createEntry: (key: string) => KeyRule,
): () => void {
  const array = container[property] ?? [];
  if (container[property] === undefined) {
    if (property === 'allowedKeys') {
      container.allowedKeys = array;
    } else if (property === 'penetrationKeys') {
      container.penetrationKeys = array;
    } else {
      container.stoppedKeys = array;
    }
  }
  const added: string[] = [];
  for (const k of keys) {
    if (!array.some((r) => r.key === k)) {
      array.push(createEntry(k));
      added.push(k);
    }
  }
  return () => {
    const filtered = array.filter((r) => !added.includes(r.key));
    if (property === 'allowedKeys') {
      container.allowedKeys = filtered;
    } else if (property === 'penetrationKeys') {
      container.penetrationKeys = filtered;
    } else {
      container.stoppedKeys = filtered;
    }
  };
}

// Pure helpers for shortcut / sequence action CRUD
// Both shortcutOperationsRef and sequenceOperationsRef share the same
// Map<string, { action, keys?, timeout? }> shape.  The CRUD callbacks
// below differ only in which ref they target; these three functions
// eliminate that duplication.

/**
 * Insert a value into the map unless the id already exists.
 * Used by addAction / addSequenceAction.
 *
 * @returns `true` if inserted, `false` if the id already existed.
 */
export function setIfAbsent<T>(
  map: Map<string, T>,
  id: string,
  value: T,
): boolean {
  if (map.has(id)) {
    return false;
  }
  map.set(id, value);
  return true;
}

/**
 * Delete an entry from the map.
 * Used by removeAction / removeSequenceAction.
 *
 * @returns `true` if the id existed and was removed, `false` otherwise.
 */
export function deleteIfPresent(
  map: Map<string, unknown>,
  id: string,
): boolean {
  return map.delete(id);
}

/**
 * An operation entry (shortcut or sequence) that may carry preset keys.
 *
 * The `keys` array stores the default key names that trigger the action;
 * {@link modifyEntryKeys} overwrites them in place.
 */
export type EntryWithOptionalKeys = {
  /** Preset key names that trigger the action. */
  keys?: string[];
};

/**
 * Retrieve an entry and overwrite its keys.  Returns the entry so callers
 * can apply additional mutations (e.g. timeout for sequence actions).
 * Used by modifyAction / modifySequenceAction.
 *
 * @typeParam T - Entry type carrying optional preset keys
 *                (see {@link EntryWithOptionalKeys}).
 * @returns The mutated entry, or `undefined` when the id is absent or was
 *          registered without preset keys.
 */
export function modifyEntryKeys<T extends EntryWithOptionalKeys>(
  map: Map<string, T>,
  id: string,
  keys: string[],
): T | undefined {
  const entry = map.get(id);
  if (!entry || entry.keys === undefined) {
    return undefined;
  }
  entry.keys = keys;
  return entry;
}

/**
 * Clear all registered shortcut operations.
 *
 * NOTE: Since the refactoring to per-instance useRef state, this function
 * is a no-op at module level. Shortcut operations are now scoped to each
 * {@link KeyboardEngine} instance and are automatically cleaned up when
 * the instance is garbage-collected.
 *
 * Kept for backward compatibility with tests and external consumers that
 * call this function in cleanup routines.
 *
 * @deprecated State is now per-instance via KeyboardEngine. Module-level
 *             clearShortcutOperations is a no-op. Use engine.clearShortcutOperations()
 *             for instance-level cleanup.
 */
export function clearShortcutOperations(): void {
  // No-op: state is now per-instance via KeyboardEngine
}

/**
 * Finalize a bound keyboard entry: register action-key mappings (when the
 * handler is a string action ID), create an unbind closure that cleans up
 * the binding and global-key overrides, and optionally wrap the handler with
 * times/once lifecycle.
 *
 * Extracted from {@link KeyboardEngine.boundKeyboard} to eliminate the
 * duplicate block that previously appeared identically in both the
 * focus‑target and layer‑level branches.
 *
 * @param bindingsArray  The array the entry was pushed into
 *                       (`ScreenKeyboardLayer.bindings` or
 *                       focus‑target bindings).
 * @param actionKeysMap  The corresponding action‑keys map.
 * @param layer          The enclosing screen keyboard layer.
 * @param entry          The binding entry just created.
 * @param handler        Original handler (function or action‑ID string).
 * @param keys           Normalized key names.
 * @param options        Original {@link BoundKeyboardOptions}.
 * @returns              An unbind function that reverses the registration.
 */
export function finalizeBoundKeyboard(
  bindingsArray: BaseBoundKeyEntry[],
  actionKeysMap: Map<string, string[]>,
  layer: KeyboardLayerWithBindings,
  entry: BaseBoundKeyEntry,
  handler: KeyHandler | string,
  keys: string[],
  options?: BoundKeyboardOptions,
): () => void {
  // If handler is a string (actionId), register the keys in the
  // actionKeysMap so that stop({ stopAction: true }) and modifyAction()
  // can later resolve the action to its bound keys.
  if (typeof handler === 'string') {
    const existing = actionKeysMap.get(handler) || [];
    for (const k of keys) {
      if (!existing.includes(k)) existing.push(k);
    }
    actionKeysMap.set(handler, existing);
  }

  const doUnbind = () => {
    const idx = bindingsArray.indexOf(entry);
    if (idx !== -1) bindingsArray.splice(idx, 1);
    cleanupGlobalKeyOverrides(layer, entry.keys);
    if (typeof handler === 'string') {
      removeKeysFromActionMap(actionKeysMap, handler, keys);
    }
  };

  // Wrap handler with times / once lifecycle when requested.
  if (options?.times !== undefined && options.times >= 1) {
    entry.times = options.times;
    entry.pressCount = 0;
    entry.observer = options?.observer;
    const originalHandler = entry.handler;
    entry.handler = (input: string, key: unknown) => {
      entry.pressCount! += 1;
      entry.observer?.(entry.times! - entry.pressCount!);
      if (entry.pressCount! < entry.times!) {
        return;
      }
      entry.pressCount = 0;
      if (options?.once) {
        doUnbind();
      }
      originalHandler(input, key);
    };
  } else if (options?.once) {
    const originalHandler = entry.handler;
    entry.handler = (input: string, key: unknown) => {
      doUnbind();
      originalHandler(input, key);
    };
  }

  return doUnbind;
}
