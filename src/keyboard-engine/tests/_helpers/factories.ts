import KeyboardEngine from "../../src/KeyboardEngine.js";
import type {
  BaseBoundKeyEntry,
  BaseSequenceBinding,
  PageBoundKeyEntry,
  PageSequenceBinding,
} from "../../src/types/binding.js";
import type {
  FocusTarget,
  PageFocusTarget,
} from "../../src/types/focus.js";
import type { KeyRule } from "../../src/types/key-rule.js";
import type { KeyboardLayer } from "../../src/types/keyboard-layer.js";
import type {
  ElementKeyboard,
  LayerKeyboardLayer,
  PageKeyboardLayer,
} from "../../src/types/page-layer.js";
import type {
  GlobalPendingSequence,
  PendingSequence,
} from "../../src/types/pending-sequence.js";
import type { PipelineContext } from "../../src/types/processor.js";

export function createEngine(
  options: {
    modes?: string[];
    defaultMode?: string;
    autoTab?: boolean;
    tabKey?: string;
    releaseFocusWhenEmpty?: boolean;
    isNormalChar?: (key: unknown) => boolean;
    normalizeKeyNames?: (input: string) => string[];
  } = {},
): KeyboardEngine {
  return new KeyboardEngine({
    modes: options.modes,
    defaultMode: options.defaultMode,
    autoTab: options.autoTab,
    tabKey: options.tabKey,
    releaseFocusWhenEmpty: options.releaseFocusWhenEmpty,
    normalizeKeyNames:
      options.normalizeKeyNames ??
      ((input: string) => (input ? [input] : [])),
    isNormalChar: options.isNormalChar ?? (() => false),
  });
}

export function makePageLayer(
  overrides: Partial<PageKeyboardLayer> = {},
): PageKeyboardLayer {
  return {
    bindings: [],
    penetrationKeys: [],
    stoppedKeys: [],
    globalKeyOverrides: new Set(),
    actionKeysMap: new Map(),
    focusTargets: new Map(),
    defaultTargets: new Map(),
    defaultFocusOrder: [],
    currentFocusIds: [],
    sequences: new Map(),
    pendingSequence: null,
    ...overrides,
  };
}

export function makeElementKeyboard(
  elementId: string,
  layerId = "layer-1",
  overrides: Partial<ElementKeyboard> = {},
): ElementKeyboard {
  return {
    bindings: [],
    elementId,
    associatedLayer: layerId,
    penetrationKeys: [],
    stoppedKeys: [],
    globalKeyOverrides: new Set(),
    actionKeysMap: new Map(),
    allowedKeys: [],
    missListener: { onMiss: null, onMissOptions: null },
    focusTargets: new Map(),
    defaultTargets: new Map(),
    defaultFocusOrder: [],
    currentFocusIds: [],
    sequences: new Map(),
    ...overrides,
  };
}

export function makeLayerKeyboard(
  layerId: string,
  elements: Record<string, ElementKeyboard> = {},
): LayerKeyboardLayer {
  return {
    layerId,
    pendingSequence: { fromElementId: null, pendingSequence: null },
    elementKeyboards: new Map(Object.entries(elements)),
  };
}

export function makeSyncLayer(
  layerId: string,
  activeElements: string[],
): KeyboardLayer {
  return { layerId, elements: activeElements, activeElements };
}

export function makeContext(
  overrides: Partial<PipelineContext<unknown>> = {},
): PipelineContext<unknown> {
  return {
    input: "x",
    key: {},
    eventNames: ["x"],
    isNormalChar: () => false,
    topComponent: null,
    globalKeys: [],
    globalSequences: [],
    wildcardFirst: false,
    pagePath: [],
    allLayers: [],
    allModalLayers: [],
    layersRef: new Map(),
    layerKeyboardRefs: new Map(),
    pendingSeqRef: { current: null as GlobalPendingSequence | null },
    notifyFocusChange: () => {},
    notifyPendingSyncs: () => {},
    currentMode: null,
    conditions: new Map(),
    compositionEngineHandler: false,
    compositionEngine:
      undefined as unknown as PipelineContext<unknown>["compositionEngine"],
    autoTab: false,
    autoTabKey: "tab",
    ...overrides,
  };
}

export function makeBinding(
  keys: string[],
  handler: (input: string, key: unknown) => void = () => {},
  overrides: Partial<BaseBoundKeyEntry> = {},
): BaseBoundKeyEntry {
  return { keys, handler, ...overrides };
}

export function makePageBinding(
  keys: string[],
  handler: (input: string, key: unknown) => void = () => {},
  overrides: Partial<PageBoundKeyEntry> = {},
): PageBoundKeyEntry {
  return {
    keys,
    handler,
    stopsWorkingAfterLayerAppearing: false,
    ...overrides,
  };
}

export function makeSequenceBinding(
  keys: string[],
  handler: (input: string, key: unknown) => void = () => {},
  overrides: Partial<BaseSequenceBinding> = {},
): BaseSequenceBinding {
  return { keys, handler, ...overrides };
}

export function makePageSequenceBinding(
  keys: string[],
  handler: (input: string, key: unknown) => void = () => {},
  overrides: Partial<PageSequenceBinding> = {},
): PageSequenceBinding {
  return {
    keys,
    handler,
    options: { stopsWorkingAfterLayerAppearing: false },
    ...overrides,
  };
}

export function makeKeyRule(
  key: string,
  when?: (() => boolean) | string,
): KeyRule {
  return when === undefined ? { key } : { key, when };
}

export function makeFocusTarget(
  overrides: Partial<FocusTarget> = {},
): FocusTarget {
  return {
    bindings: [],
    penetrationKeys: [],
    stoppedKeys: [],
    actionKeysMap: new Map(),
    allowedKeys: [],
    ...overrides,
  };
}

export function makePageFocusTarget(
  overrides: Partial<PageFocusTarget> = {},
): PageFocusTarget {
  return {
    bindings: [],
    penetrationKeys: [],
    stoppedKeys: [],
    actionKeysMap: new Map(),
    allowedKeys: [],
    ...overrides,
  };
}

export function makePendingSequence(
  sequences: string[],
  handler: (input: string, key: unknown) => void = () => {},
  overrides: Partial<PendingSequence> = {},
): PendingSequence {
  return {
    sequences,
    nextIndex: 1,
    handler,
    timer: undefined as unknown as NodeJS.Timeout,
    timeout: 500,
    ...overrides,
  };
}
