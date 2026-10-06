// Screen System
export {
  registerComponent,
  clearRegistry,
  ScenarioManagementProvider,
  CurrentScreen,
  skip,
  back,
  gotoScreen,
  openLayer,
  applyElement,
  closeLayer,
  eraseElement,
  closeAllLayer,
  bringLayerToFront,
  restoreLayerZIndex,
  openModalLayer,
  applyElementToModalLayer,
  closeModalLayer,
  eraseElementInModalLayer,
  closeAllModalLayer,
  activateElement,
  deactivateElement,
  activateElementInModalLayer,
  deactivateElementInModalLayer,
  useScreenSystem,
  ModalLayerElementContext,
  LayerElementContext,
} from "./screen/index.js";

export type {
  SkipOptions,
  SkipFn,
  SkipArgs,
  BackFn,
  GotoScreenFn,
  GotoScreenArgs,
  RegisterOptions,
  ScenarioManagementProviderProps,
  Layer,
  LayerOptions,
  OpenLayerFn,
  ApplyElementFn,
  CloseLayerFn,
  EraseElementFn,
  CloseAllLayerFn,
  BringLayerToFrontFn,
  RestoreLayerZIndexFn,
  ActivateElementFn,
  DeactivateElementFn,
  ActivateElementInModalLayerFn,
  DeactivateElementInModalLayerFn,
  ModalLayer,
  ModalLayerOptions,
  OpenModalLayerFn,
  ApplyElementToModalLayerFn,
  CloseModalLayerFn,
  EraseElementInModalLayerFn,
  CloseAllModalLayerFn,
  LayerElement,
  LayerElementInput,
  Page,
  RegionFocusEntry,
  RegionFocusMap,
  ScreenSystemContextValue,
} from "./screen/index.js";

// Keyboard System
export {
  KeyboardProvider,
  useKeyboard,
  KeyboardEngine,
  KeyboardContext,
} from "./keyboard/index.js";
export {
  normalizeKeyNames,
  isInkSpecialKey,
  isNormalCharacter,
} from "./keyboard/index.js";
export { defaultTargetsSymbol } from "./keyboard/index.js";
export { builtinProcessorWeights } from "./keyboard/index.js";

export type {
  KeyHandler,
  BoundKeyboardOptions,
  BoundKeyboardReactOptions,
  BoundKeyEntry,
  ScreenKeyboardLayer,
  KeyboardProviderProps,
  GlobalKeyEntry,
  GlobalSequenceEntry,
  KeyboardProcessorProps,
  PipelineProcessor,
  ProcessorInput,
  EngineProps,
  KeyboardContextValue,
  MouseRegionOptions,
  MouseRegionCallbacks,
} from "./keyboard/index.js";

export type {
  PenetrationOptions,
  AllowModalOptions,
  StopOptions,
  LayerKind,
  FocusTarget,
  FocusRef,
  FocusSetOptions,
  SequenceOptions,
  SequenceReactOptions,
  ShortcutOperationEntry,
  SequenceOperationEntry,
  ModalMissEvent,
  ModalMissCallback,
  ModalMissOptions,
  ResolvedGlobalKeyEntry,
  MappingKeyEvent,
  MappingKeyEntry,
} from "./keyboard/index.js";
export {
  useFocusState,
  useModalMissListener,
  useMouseRegion,
} from "./keyboard/index.js";

// Module-level keyboard API — owner-independent engine operations callable
// without a React hook, plus the engine accessors that bracket a manual call.
export * from "./keyboard/moduleApi.js";
export { getEngine, withOwner } from "./keyboard/index.js";
