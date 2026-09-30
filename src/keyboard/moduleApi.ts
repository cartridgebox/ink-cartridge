import type { KeyboardContextValue } from "./context.js";
import { getEngine } from "./provider/KeyboardProvider.js";

/**
 * Module-level keyboard API.
 *
 * Every function here forwards to the {@link getEngine | mounted engine} —
 * the same instance the enclosing `KeyboardProvider` created — so global,
 * owner-independent operations (processors, shortcut/sequence actions, modes,
 * conditions, composition, mapping, global keys, mouse regions) can be driven
 * from module scope instead of going through {@link useKeyboard}.
 *
 * The engine is registered by `KeyboardProvider` during render, so these
 * resolve from any effect — including a child's, which React runs before the
 * provider's own effects.
 *
 * Owner- and element-scoped methods (`boundKeyboard`, `boundSequence`,
 * `penetration`, `stop`, `allowModal`, the `focus*` family) are intentionally
 * absent: they resolve a layer/page owner from React context. Reach them
 * through {@link useKeyboard}, or bracket a manual `getEngine()` call with
 * {@link withOwner}.
 *
 * @throws If no `KeyboardProvider` is mounted when the function runs.
 *
 * @example
 * ```ts
 * import { addProcessor, setProcessorWeight } from 'ink-cartridge';
 *
 * addProcessor({ id: 'logger', process }, { before: 'modal' });
 * setProcessorWeight('logger', 5);
 * ```
 *
 * @module
 */

/** Register or replace the mounted engine's global key bindings. */
export const globalKeys: KeyboardContextValue["globalKeys"] = (...args) =>
  getEngine().globalKeys(...args);

/** Return the mounted engine's resolved global key bindings. */
export const getGlobalKeys: KeyboardContextValue["getGlobalKeys"] = (...args) =>
  getEngine().getGlobalKeys(...args);

/** Register or replace the mounted engine's global sequence bindings. */
export const globalSequence: KeyboardContextValue["globalSequence"] = (...args) =>
  getEngine().globalSequence(...args);

/** Return the mounted engine's resolved global sequence bindings. */
export const getGlobalSequences: KeyboardContextValue["getGlobalSequences"] = (
  ...args
) => getEngine().getGlobalSequences(...args);

/** Return the global sequence currently awaiting more keys, if any. */
export const getGlobalPendingSequence: KeyboardContextValue["getGlobalPendingSequence"] =
  (...args) => getEngine().getGlobalPendingSequence(...args);

/** Whether the global key/sequence queue still has pending work. */
export const thereGlobalQueueWaiting: KeyboardContextValue["thereGlobalQueueWaiting"] =
  (...args) => getEngine().thereGlobalQueueWaiting(...args);

/** Whether the current screen has a sequence awaiting more keys. */
export const currentScreenHasSequenceWaiting: KeyboardContextValue["currentScreenHasSequenceWaiting"] =
  (...args) => getEngine().currentScreenHasSequenceWaiting(...args);

/** Subscribe to focus changes; returns an unsubscribe function. */
export const subscribeFocus: KeyboardContextValue["subscribeFocus"] = (...args) =>
  getEngine().subscribeFocus(...args);

/** Define shortcut actions in bulk on the mounted engine. */
export const defineShortcutAction: KeyboardContextValue["defineShortcutAction"] =
  (...args) => getEngine().defineShortcutAction(...args);

/** Register a single shortcut action. */
export const addAction: KeyboardContextValue["addAction"] = (...args) =>
  getEngine().addAction(...args);

/** Whether a shortcut action id is registered. */
export const hasAction: KeyboardContextValue["hasAction"] = (...args) =>
  getEngine().hasAction(...args);

/** Remove a shortcut action by id. */
export const removeAction: KeyboardContextValue["removeAction"] = (...args) =>
  getEngine().removeAction(...args);

/** Replace a shortcut action's key list. */
export const modifyAction: KeyboardContextValue["modifyAction"] = (...args) =>
  getEngine().modifyAction(...args);

/**
 * Clear every shortcut action registered on the mounted engine.
 *
 * Distinct from the engine package's own `clearShortcutOperations`, which is
 * a no-op — shortcut state lives per-instance on the engine.
 */
export const clearShortcutOperations: KeyboardContextValue["clearShortcutOperations"] =
  (...args) => getEngine().clearShortcutOperations(...args);

/** Define sequence actions in bulk on the mounted engine. */
export const defineSequenceAction: KeyboardContextValue["defineSequenceAction"] =
  (...args) => getEngine().defineSequenceAction(...args);

/** Register a single sequence action. */
export const addSequenceAction: KeyboardContextValue["addSequenceAction"] = (
  ...args
) => getEngine().addSequenceAction(...args);

/** Whether a sequence action id is registered. */
export const hasSequenceAction: KeyboardContextValue["hasSequenceAction"] = (
  ...args
) => getEngine().hasSequenceAction(...args);

/** Remove a sequence action by id. */
export const removeSequenceAction: KeyboardContextValue["removeSequenceAction"] =
  (...args) => getEngine().removeSequenceAction(...args);

/** Replace a sequence action's keys and optional timeout. */
export const modifySequenceAction: KeyboardContextValue["modifySequenceAction"] =
  (...args) => getEngine().modifySequenceAction(...args);

/** Clear every sequence action registered on the mounted engine. */
export const clearSequenceOperations: KeyboardContextValue["clearSequenceOperations"] =
  (...args) => getEngine().clearSequenceOperations(...args);

/** Read the keyboard layer registered for an owner. */
export const readLayer: KeyboardContextValue["readLayer"] = (owner) =>
  // The engine's readLayer is overloaded (component vs layer-id); narrow so
  // the matching overload is picked.
  typeof owner === "string"
    ? getEngine().readLayer(owner)
    : getEngine().readLayer(owner);

/** Return the mounted engine's active mode, or `null` when none is set. */
export const getCurrentMode: KeyboardContextValue["getCurrentMode"] = (...args) =>
  getEngine().getCurrentMode(...args);

/** Register a mode name. */
export const addMode: KeyboardContextValue["addMode"] = (...args) =>
  getEngine().addMode(...args);

/** Unregister a mode name. */
export const removeMode: KeyboardContextValue["removeMode"] = (...args) =>
  getEngine().removeMode(...args);

/** Switch to a mode, or clear the current mode with `null`. */
export const setMode: KeyboardContextValue["setMode"] = (...args) =>
  getEngine().setMode(...args);

/** Cycle to the next registered mode. */
export const nextMode: KeyboardContextValue["nextMode"] = (...args) =>
  getEngine().nextMode(...args);

/** Cycle to the previous registered mode. */
export const prevMode: KeyboardContextValue["prevMode"] = (...args) =>
  getEngine().prevMode(...args);

/** Register a named condition with its default value. */
export const addCondition: KeyboardContextValue["addCondition"] = (...args) =>
  getEngine().addCondition(...args);

/** Set a named condition's current value. */
export const setCondition: KeyboardContextValue["setCondition"] = (...args) =>
  getEngine().setCondition(...args);

/** Unregister a named condition. */
export const removeCondition: KeyboardContextValue["removeCondition"] = (...args) =>
  getEngine().removeCondition(...args);

/** Append or position a custom pipeline processor. */
export const addProcessor: KeyboardContextValue["addProcessor"] = (...args) =>
  getEngine().addProcessor(...args);

/** Remove a pipeline processor by id. */
export const removeProcessor: KeyboardContextValue["removeProcessor"] = (...args) =>
  getEngine().removeProcessor(...args);

/** Return the mounted engine's current pipeline processors. */
export const getProcessors: KeyboardContextValue["getProcessors"] = (...args) =>
  getEngine().getProcessors(...args);

/** Restore the mounted engine's built-in pipeline processors. */
export const resetProcessors: KeyboardContextValue["resetProcessors"] = (...args) =>
  getEngine().resetProcessors(...args);

/** Re-enable a processor previously disabled by `kickProcessor`. */
export const activeProcessor: KeyboardContextValue["activeProcessor"] = (...args) =>
  getEngine().activeProcessor(...args);

/** Disable a processor at runtime without removing it from the pipeline. */
export const kickProcessor: KeyboardContextValue["kickProcessor"] = (...args) =>
  getEngine().kickProcessor(...args);

/** Reorder a processor by setting its pipeline weight. */
export const setProcessorWeight: KeyboardContextValue["setProcessorWeight"] = (
  ...args
) => getEngine().setProcessorWeight(...args);

/** Register a composition key. */
export const registryCompositionKey: KeyboardContextValue["registryCompositionKey"] =
  (...args) => getEngine().registryCompositionKey(...args);

/** Remove a composition key by id. */
export const removeCompositionKey: KeyboardContextValue["removeCompositionKey"] =
  (...args) => getEngine().removeCompositionKey(...args);

/** Remove every registered composition key. */
export const clearAllCompositionKeys: KeyboardContextValue["clearAllCompositionKeys"] =
  (...args) => getEngine().clearAllCompositionKeys(...args);

/** Whether a composition chain is currently in progress. */
export const hasPendingComposition: KeyboardContextValue["hasPendingComposition"] =
  (...args) => getEngine().hasPendingComposition(...args);

/** Return the current composition context. */
export const getCompositionContext: KeyboardContextValue["getCompositionContext"] =
  (...args) => getEngine().getCompositionContext(...args);

/** Abort the in-progress composition chain. */
export const abortComposition: KeyboardContextValue["abortComposition"] = (...args) =>
  getEngine().abortComposition(...args);

/** Update a composition key's flags and metadata. */
export const updateCompositionKey: KeyboardContextValue["updateCompositionKey"] = (
  ...args
) => getEngine().updateCompositionKey(...args);

/** Replace the composition value schema. */
export const setValueSchema: KeyboardContextValue["setValueSchema"] = (...args) =>
  getEngine().setValueSchema(...args);

/** Undo the last composition step(s). */
export const undoComposition: KeyboardContextValue["undoComposition"] = (...args) =>
  getEngine().undoComposition(...args);

/** Return the number of buffered composition steps. */
export const bufferedCompositionCount: KeyboardContextValue["bufferedCompositionCount"] =
  (...args) => getEngine().bufferedCompositionCount(...args);

/** Clear the composition undo buffers. */
export const clearCompositionBuffers: KeyboardContextValue["clearCompositionBuffers"] =
  (...args) => getEngine().clearCompositionBuffers(...args);

/** Subscribe to composition events; returns an unsubscribe function. */
export const subscribeComposition: KeyboardContextValue["subscribeComposition"] = (
  ...args
) => getEngine().subscribeComposition(...args);

/** Return the most recent composition event. */
export const getLastCompositionEvent: KeyboardContextValue["getLastCompositionEvent"] =
  (...args) => getEngine().getLastCompositionEvent(...args);

/** Register a key mapping. */
export const addMapping: KeyboardContextValue["addMapping"] = (...args) =>
  getEngine().addMapping(...args);

/** Remove a mapping by its key sequence. */
export const removeMappingKey: KeyboardContextValue["removeMappingKey"] = (...args) =>
  getEngine().removeMappingKey(...args);

/** Remove every mapping starting with a given key. */
export const removeMapping: KeyboardContextValue["removeMapping"] = (...args) =>
  getEngine().removeMapping(...args);

/** Subscribe to mapping events; returns an unsubscribe function. */
export const subscribeMapping: KeyboardContextValue["subscribeMapping"] = (...args) =>
  getEngine().subscribeMapping(...args);

/** Return the most recent mapping event. */
export const getLastMappingEvent: KeyboardContextValue["getLastMappingEvent"] = (
  ...args
) => getEngine().getLastMappingEvent(...args);

/** Register a mouse region; returns an unregister function. */
export const registerMouseRegion: KeyboardContextValue["registerMouseRegion"] = (
  ...args
) => getEngine().registerMouseRegion(...args);

/** Remove a mouse region by layer and region id. */
export const unregisterMouseRegion: KeyboardContextValue["unregisterMouseRegion"] = (
  ...args
) => getEngine().unregisterMouseRegion(...args);

/** Return the currently hovered mouse region, if any. */
export const getHoveredMouseRegion: KeyboardContextValue["getHoveredMouseRegion"] = (
  ...args
) => getEngine().getHoveredMouseRegion(...args);

/** Enable wildcard-priority matching; returns a function that disables it. */
export const enableWildcardPriority: KeyboardContextValue["enableWildcardPriority"] =
  (...args) => getEngine().enableWildcardPriority(...args);
