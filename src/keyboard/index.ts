export { KeyboardProvider } from "./provider/KeyboardProvider.js";
export { KeyboardContext } from "./context.js";
export type {
  BoundKeyboardReactOptions,
  KeyboardContextValue,
  SequenceReactOptions,
} from "./context.js";
export {
  useKeyboard,
  useFocusState,
  useModalMissListener,
  useMouseRegion,
} from "./hook.js";
export type { MouseRegionOptions } from "./hook.js";

import { isNormalCharacter as engineIsNormalCharacter } from "@cartridge-engine/keyboard-engine";
import { isInkSpecialKey } from "./keyNormalizer.js";

/**
 * Determine whether the key event represents a "normal" character.
 *
 * Ink-specific wrapper — uses {@link isInkSpecialKey} to inspect
 * Ink's Key descriptor for special keys.
 *
 * @param input - Raw character from Ink's useInput.
 * @param key   - Key descriptor from Ink.
 * @returns true when the event should be treated as a normal character.
 */
export function isNormalCharacter(input: string, key: unknown): boolean {
  return engineIsNormalCharacter(input, key, isInkSpecialKey);
}
export { isInkSpecialKey, normalizeKeyNames } from "./keyNormalizer.js";

export {
  KeyboardEngine,
  defaultTargetsSymbol,
} from "@cartridge-engine/keyboard-engine";
export {
  checkWhen,
  checkGlobalKey,
  handleLayer,
  tryMatchBindings,
  handleTabNavigation,
  keyMatchesRule,
  cleanupGlobalKeyOverrides,
  removeKeysFromActionMap,
  pushKeyEntries,
  setIfAbsent,
  deleteIfPresent,
  modifyEntryKeys,
  finalizeBoundKeyboard,
  createModalProcessor,
  createCompositionProcessor,
  createGlobalSequenceProcessor,
  createGlobalKeyProcessor,
  createLayerProcessor,
  createScreenStackProcessor,
  builtinProcessorWeights,
} from "@cartridge-engine/keyboard-engine";

export type { EngineProps } from "@cartridge-engine/keyboard-engine";
export type { KeyRuleContainer } from "@cartridge-engine/keyboard-engine";
export type {
  KeyHandler,
  BoundKeyboardOptions,
  BoundKeyEntry,
  PenetrationOptions,
  AllowModalOptions,
  StopOptions,
  ScreenKeyboardLayer,
  LayerKind,
  FocusTarget,
  FocusRef,
  FocusSetOptions,
  GlobalKeyEntry,
  GlobalSequenceEntry,
  SequenceOptions,
  SequenceBinding,
  PendingSequence,
  ShortcutOperationEntry,
  SequenceOperationEntry,
  ModalMissEvent,
  ModalMissCallback,
  ModalMissOptions,
  ResolvedGlobalKeyEntry,
  KeyboardProcessorProps,
  PipelineProcessor,
  ProcessorInput,
  MutableRef,
  CompositionKey,
  CompositionContext,
  ValueGuard,
  ValueSchema,
  Flags,
  MappingKeyEvent,
  MappingKeyEntry,
  MouseRegionCallbacks,
  MouseRegionRect,
} from "@cartridge-engine/keyboard-engine";

export type { KeyboardProviderProps } from "./provider/KeyboardProvider.js";

export { getEngine, withOwner } from "./provider/KeyboardProvider.js";
export * from "./moduleApi.js";
