import { ComponentType, createContext, type RefObject } from "react";
import type { DOMElement } from "ink";
import type {
  KeyHandler,
  BoundKeyboardOptions,
  PenetrationOptions,
  StopOptions,
  AllowModalOptions,
  GlobalKeyEntry,
  GlobalSequenceEntry,
  ShortcutOperationEntry,
  SequenceOperationEntry,
  SequenceOptions,
  ModalMissCallback,
  ModalMissOptions,
  ResolvedGlobalKeyEntry,
  ResolvedGlobalSequenceEntry,
  GlobalPendingSequence,
  PageKeyboardLayer,
  ElementKeyboard,
  LayerKeyboardLayer,
  PipelineProcessor,
  ProcessorInput,
  CompositionKey,
  CompositionContext,
  ValueSchema,
  Flags,
  FocusSetOptions,
  CompositionEvent,
  MappingKeyEvent,
  MappingKeyEntry,
  MouseRegionEntry,
} from "@cartridge-engine/keyboard-engine";
import { defaultTargetsSymbol } from "@cartridge-engine/keyboard-engine";

/**
 * Token identifying the owner of a keyboard layer — a layer id string
 * or the component that owns it.
 */
export type LayerOwner = string | ComponentType<any>;

/**
 * React-side extension of {@link BoundKeyboardOptions}: an optional ref to a
 * DOM element that doubles as a mouse region. When a `ref` and a `focusId`
 * are both present, `useKeyboard().boundKeyboard` records the
 * ref → focusId mapping so that clicking the region (via `useMouseRegion`)
 * forwards keyboard focus to `focusId`.
 */
export type BoundKeyboardReactOptions = BoundKeyboardOptions & {
  ref?: RefObject<DOMElement | null>;
};

/**
 * React-side extension of {@link SequenceOptions}: an optional ref to a
 * DOM element that doubles as a mouse region. When a `ref` and a `focusId`
 * are both present, `useKeyboard().boundSequence` records the
 * ref → focusId mapping so that clicking the region (via `useMouseRegion`)
 * forwards keyboard focus to `focusId`.
 */
export type SequenceReactOptions = SequenceOptions & {
  ref?: RefObject<DOMElement | null>;
}

/**
 * Value exposed by the keyboard system via React context.
 *
 * Exposes the {@link KeyboardEngine} API bound to the engine instance.
 * Layer and element scoping of bindings is handled automatically by
 * {@link useKeyboard}; consume the context directly only when necessary.
 *
 * Owner-independent methods are also exported at module level (see
 * `src/keyboard/moduleApi.ts`) so they can be called outside React.
 */
export interface KeyboardContextValue {
  boundKeyboard: {
    (
      keys: string | string[],
      handler: KeyHandler,
      options?: BoundKeyboardReactOptions,
    ): () => void;
    (
      keys: string | string[],
      actionId: string,
      options?: BoundKeyboardReactOptions,
    ): () => void;
    (actionId: string, options?: BoundKeyboardReactOptions): () => void;
  };

  penetration: (keys: string[], options?: PenetrationOptions) => () => void;

  stop: (keys: string[], options?: StopOptions) => () => void;

  allowModal: (keys: string[], options?: AllowModalOptions) => () => void;

  globalKeys: (
    entries: GlobalKeyEntry[],
    options?: { mode?: "replace" | "add" },
  ) => void;

  getGlobalKeys: () => ResolvedGlobalKeyEntry[];

  globalSequence: (
    entries: GlobalSequenceEntry[],
    options?: { mode?: "replace" | "add" },
  ) => void;

  getGlobalSequences: () => ResolvedGlobalSequenceEntry[];

  getGlobalPendingSequence: () => GlobalPendingSequence | null;

  thereGlobalQueueWaiting: (sync?: () => void) => boolean;

  currentScreenHasSequenceWaiting: (sync?: () => void) => boolean;

  focusUnregister: (
    focusId: string,
    groupOrOptions?: string | FocusSetOptions,
  ) => boolean;

  focusSet: (
    focusId: string,
    groupOrOptions?: string | FocusSetOptions,
  ) => boolean;

  focusNext: (groupOrOptions?: string | FocusSetOptions) => boolean;

  focusPrev: (groupOrOptions?: string | FocusSetOptions) => boolean;

  focusCurrent: (groupOrOptions?: string | FocusSetOptions) => {
    noOwner?: boolean;
    noLayer?: boolean;
    noFound?: boolean;
    result?: {
      id: string;
      fromGroup: string | typeof defaultTargetsSymbol;
    };
  };

  subscribeFocus: (listener: () => void) => () => void;

  defineShortcutAction: (entries: ShortcutOperationEntry[]) => boolean;
  addAction: (entry: ShortcutOperationEntry) => boolean;
  hasAction: (actionId: string) => boolean;
  removeAction: (actionId: string) => boolean;
  modifyAction: (actionId: string, keys: string[]) => boolean;
  clearShortcutOperations: () => void;

  defineSequenceAction: (entries: SequenceOperationEntry[]) => boolean;
  addSequenceAction: (entry: SequenceOperationEntry) => boolean;
  hasSequenceAction: (sequenceActionId: string) => boolean;
  removeSequenceAction: (sequenceActionId: string) => boolean;
  modifySequenceAction: (
    sequenceActionId: string,
    keys: string[],
    timeout?: number,
  ) => boolean;
  clearSequenceOperations: () => void;

  _pushOwner: (owner: LayerOwner) => void;

  _popOwner: (owner: LayerOwner) => void;

  boundSequence: {
    (
      keys: string | string[],
      handler: KeyHandler,
      options?: SequenceReactOptions,
    ): () => void;
    (
      keys: string[],
      actionId: string,
      options?: SequenceReactOptions,
    ): () => void;
    (actionId: string, options?: SequenceReactOptions): () => void;
  };

  enableWildcardPriority: () => () => void;

  useModalMissListener: (
    cb: ModalMissCallback,
    options?: ModalMissOptions,
  ) => () => void;

  readLayer: (
    owner: LayerOwner,
  ) => PageKeyboardLayer | ElementKeyboard | LayerKeyboardLayer | undefined;

  getCurrentMode: () => string | null;

  addMode: (mode: string) => boolean;

  removeMode: (mode: string) => boolean;

  setMode: (mode: string | null) => boolean;

  nextMode: () => void;

  prevMode: () => void;

  addCondition: (id: string, defaultVal: boolean) => boolean;

  setCondition: (target: string, value: boolean) => boolean;

  removeCondition: (target: string) => boolean;

  addProcessor: (
    processor: ProcessorInput<ComponentType<any>>,
    options?:
      | { weight?: number }
      | { before?: string }
      | { after?: string }
      | { index?: number },
  ) => boolean;

  removeProcessor: (processorId: string) => boolean;

  getProcessors: () => readonly PipelineProcessor<ComponentType<any>>[];

  resetProcessors: () => void;

  registryCompositionKey: (entry: CompositionKey<ComponentType<any>>) => void;
  removeCompositionKey: (key: string) => boolean;
  clearAllCompositionKeys: () => void;
  hasPendingComposition: () => boolean;
  getCompositionContext: () => CompositionContext;
  abortComposition: () => void;
  updateCompositionKey: (
    key: string,
    flags: Flags,
    updates: Partial<Omit<CompositionKey<ComponentType<any>>, "key" | "flags">>,
  ) => boolean;

  setValueSchema: (schema: ValueSchema) => void;

  undoComposition: (
    steps?: number,
    options?: { isolated?: boolean; byKey?: boolean },
  ) => CompositionContext | null;
  bufferedCompositionCount: () => number;
  clearCompositionBuffers: () => void;
  subscribeComposition: (fn: () => void) => () => void;
  getLastCompositionEvent: () => CompositionEvent | null;

  addMapping: (
    base: string[],
    target: string[],
    options?: Omit<MappingKeyEntry<ComponentType<any>>, "keys" | "target">,
  ) => boolean;
  removeMappingKey: (keys: string[]) => boolean;
  removeMapping: (firstKey: string) => boolean;
  subscribeMapping: (fn: () => void) => () => void;
  getLastMappingEvent: () => MappingKeyEvent | null;

  activateFocusGroup: (
    focusId: string,
    groupOrOptions?: string | FocusSetOptions,
  ) => boolean;
  kickFocusGroup: (groupOrOptions?: string | FocusSetOptions) => boolean;

  kickProcessor: (id: string) => boolean;
  activeProcessor: (id: string) => boolean;
  setProcessorWeight: (id: string, weight: number) => boolean;

  registerMouseRegion: (entry: MouseRegionEntry) => () => void;
  unregisterMouseRegion: (layerId: string, regionId: string) => void;
  getHoveredMouseRegion: () => { layerId: string; regionId: string } | null;
}

/**
 * React context for the keyboard system.
 *
 * Accessed via {@link useKeyboard}. Must be provided by a
 * {@link KeyboardProvider} nested inside a
 * {@link ScenarioManagementProvider}.
 */
export const KeyboardContext = createContext<KeyboardContextValue | null>(null);
