import type CompositionEngine from "../CompositionEngine.js";
import { EngineProps } from "../KeyboardEngine.js";
import {
  ResolvedGlobalKeyEntry,
  ResolvedGlobalSequenceEntry,
} from "../types/entry.js";
import { LayerKeyboardLayer, PageKeyboardLayer } from "../types/page-layer.js";
import { GlobalPendingSequence } from "../types/pending-sequence.js";
import { PipelineProcessor } from "../types/processor.js";
import { SyncState } from "../types/state-sync.js";

/**
 * Mutable keyboard state shared across the engine's services and processors.
 */
export default class EngineState<TComponent> {
  /**
   * State snapshot pushed by the host framework on each render and
   * consumed by the keyboard engine.
   */
  synchronizedData: SyncState<TComponent> = {
    pagePath: [],
    layers: [],
    modalLayers: [],
  };

  /**
   * Owners (layer/modal ids) pushed by mounted layer elements so bindings
   * are attributed to the element's own layer instead of the top layer.
   */
  ownerStackRef: (TComponent | string)[] = [];

  /** Set of registered mode names. */
  modesRef: Set<string>;
  /** Currently active mode, or null (no-mode). */
  currentModeRef: string | null;

  /**
   * Named boolean conditions used by `when: "conditionId"` in binding options.
   * Stored separately from modes because conditions are evaluated per-key
   * (dynamic toggles) while mode is a single global state.
   */
  conditions: Map<string, boolean> = new Map();

  /** Registered global key entries. */
  globalKeysRef: ResolvedGlobalKeyEntry[] = [];
  /**
   * Registered listeners notified whenever the active focus target changes.
   * Used by UI components to re-render focus indicators.
   */
  focusSubscribersRef: Set<() => void> = new Set<() => void>();
  /**
   * Registered sync callbacks from {@link currentScreenHasSequenceWaiting}
   * and {@link thereGlobalQueueWaiting}. Called after each
   * {@link processKey} so the host framework can re-render.
   */
  pendingSyncs: Set<() => void> = new Set<() => void>();
  /**
   * Reference count for wildcard-priority mode.
   * When > 0, `"*"` bindings fire before exact-key bindings.
   * Multiple callers can enable independently; the mode disables at 0.
   */
  wildcardPriorityCountRef: number = 0;

  /** Registered global multi-key sequences. */
  globalSequencesRef: ResolvedGlobalSequenceEntry[] = [];

  /**
   * Currently pending global sequence state.
   * Written directly by the global-sequence processor between consecutive
   * key presses; must be mutable and shared across pipeline invocations.
   */
  globalPendingSeqRef: GlobalPendingSequence | null = null;

  /**
   * Maps actionId → { action, keys }.
   * The actionId is the map key, NOT stored in the value — if it were, a
   * stale reference to an old key could leak through typed access.
   */
  shortcutOperationsRef: Map<string, { action: () => void; keys?: string[] }> =
    new Map();

  /**
   * Maps sequenceActionId → { action, keys, timeout }.
   * Same key-not-in-value pattern as shortcutOperationsRef.
   */
  sequenceOperationsRef: Map<
    string,
    { action: () => void; keys?: string[]; timeout?: number }
  > = new Map();

  /** Keyboard data per page screen component. */
  pageLayerKeyboards: Map<TComponent, PageKeyboardLayer> = new Map();

  /**
   * Keyboard data per overlay/modal layer id. The nested map's keys are
   * element IDs.
   */
  layersKeyboardMap: Map<string, LayerKeyboardLayer> = new Map();

  /**
   * The active processor pipeline for this engine instance: an outer list of
   * stages sorted by weight (descending), each stage grouping the processors
   * that share that weight.
   *
   * Mutate only through `PipelineManager` — it holds an id-keyed index and a
   * flattened snapshot cache that both track this array by reference.
   */
  _processors: PipelineProcessor<TComponent>[][] = [];

  /** The host-provided key-name normalizer, wired at construction. */
  _normalizeKeyNames: (input: string, key: unknown) => string[];

  /** The host-provided normal-character checker, wired at construction. */
  _isNormalChar: (key: unknown) => boolean;

  /**
   * `true` while a composition chain is pending, so processors know the
   * composition engine is waiting for the next key.
   */
  compositionEngineHandler: boolean = false;

  /** Whether the engine auto-handles Tab/Shift+Tab for focus rotation. */
  autoTab: boolean;
  /** Key name used for auto-tab focus rotation (default `"tab"`). */
  tabKey: string;

  /** The composition engine instance, assigned by KeyboardEngine after construction. */
  compositionEngine!: CompositionEngine<TComponent>;

  constructor(props: EngineProps<TComponent>) {
    this.modesRef = new Set(props.modes ?? []);
    this.currentModeRef = props.defaultMode ?? null;
    this._normalizeKeyNames = props.normalizeKeyNames;
    this._isNormalChar = props.isNormalChar;
    this.tabKey = props.tabKey ?? "tab";
    this.autoTab = props.autoTab ?? false;
  }
}
