import { defaultTargetsSymbol } from "../types/default-targets-symbol.js";
import {
  FocusCurrentResult,
  FocusSetOptions,
  FocusTarget,
} from "../types/focus.js";
import { KeyboardLayer } from "../types/keyboard-layer.js";
import {
  ElementKeyboard,
  LayerKeyboardLayer,
  PageKeyboardLayer,
} from "../types/page-layer.js";
import EngineState from "./EngineState.js";

/**
 * Owns layer lifecycle (create/read/clean) and focus management for the
 * current owner stack.
 */
export default class LayerManager<TComponent = unknown> {
  constructor(private state: EngineState<TComponent>) {}

  prevPath: TComponent[] = [];
  prevLayers: KeyboardLayer[] = [];
  prevModalLayers: KeyboardLayer[] = [];

  /**
   * Remove keyboard layers of pages that no longer exist in the current path,
   * cancelling any pending sequence timers on the removed layers.
   */
  cleanPages() {
    const prev = this.prevPath;
    for (const comp of prev) {
      if (!this.state.synchronizedData.pagePath.includes(comp)) {
        const layer = this.state.pageLayerEelementsKeyboards.get(comp);
        if (layer?.pendingSequence) {
          clearTimeout(layer.pendingSequence.timer);
          layer.pendingSequence = null;
        }
        this.state.pageLayerEelementsKeyboards.delete(comp);
      }
    }
    this.prevPath = [...this.state.synchronizedData.pagePath];
  }

  cleanLayers() {
    for (const prevLayer of this.prevLayers) {
      const layerKeyboard = this.state.layersKeyboardMap.get(prevLayer.layerId);
      const layerIndex = this.state.synchronizedData.layers.findIndex(
        (layer) => layer.layerId === prevLayer.layerId,
      );

      if (layerIndex !== -1 && layerKeyboard) {
        for (const element of prevLayer.elements) {
          const layer = this.state.synchronizedData.layers[layerIndex];
          if (!layer.elements.includes(element)) {
            if (layerKeyboard.pendingSequence.fromElementId === element) {
              const timer = layerKeyboard.pendingSequence.pendingSequence.timer;
              clearTimeout(timer);
              layerKeyboard.pendingSequence = {
                fromElementId: null,
                pendingSequence: null,
              };
            }
            layerKeyboard.elementKeyboards.delete(element);
          }
        }
      } else {
        if (layerKeyboard?.pendingSequence.pendingSequence) {
          const timer = layerKeyboard.pendingSequence.pendingSequence.timer;
          clearTimeout(timer);
          layerKeyboard.pendingSequence = {
            fromElementId: null,
            pendingSequence: null,
          };
        }
        this.state.layersKeyboardMap.delete(prevLayer.layerId);
      }
    }

    this.prevLayers = [...this.state.synchronizedData.layers];
  }

  cleanModalLayers() {
    for (const prevModalLayer of this.prevModalLayers) {
      const layerKeyboard = this.state.layersKeyboardMap.get(
        prevModalLayer.layerId,
      );
      const modalLayerIndex = this.state.synchronizedData.modalLayers.findIndex(
        (layer) => layer.layerId === prevModalLayer.layerId,
      );

      if (modalLayerIndex !== -1 && layerKeyboard) {
        for (const element of prevModalLayer.elements) {
          const currentModalLayer =
            this.state.synchronizedData.modalLayers[modalLayerIndex];
          if (!currentModalLayer.elements.includes(element)) {
            if (layerKeyboard.pendingSequence.fromElementId === element) {
              const timer = layerKeyboard.pendingSequence.pendingSequence.timer;
              clearTimeout(timer);
              layerKeyboard.pendingSequence = {
                fromElementId: null,
                pendingSequence: null,
              };
            }
            layerKeyboard.elementKeyboards.delete(element);
          }
        }
      } else {
        if (layerKeyboard?.pendingSequence.pendingSequence) {
          const timer = layerKeyboard.pendingSequence.pendingSequence.timer;
          clearTimeout(timer);
          layerKeyboard.pendingSequence = {
            fromElementId: null,
            pendingSequence: null,
          };
        }
        this.state.layersKeyboardMap.delete(prevModalLayer.layerId);
      }
    }

    this.prevModalLayers = [...this.state.synchronizedData.modalLayers];
  }

  private createKeyboardLayer(): PageKeyboardLayer {
    return {
      bindings: [],
      penetrationKeys: [],
      stoppedKeys: [],
      globalKeyOverrides: new Set(),
      focusTargets: new Map(),
      defaultFocusOrder: [],
      currentFocusIds: [],
      defaultTargets: new Map(),
      actionKeysMap: new Map(),
      sequences: new Map(),
      pendingSequence: null,
    };
  }

  getLayer(screenComponent: TComponent): PageKeyboardLayer;
  getLayer(layerId: string, elementId: string): ElementKeyboard;
  getLayer(
    ownerOrLayer: TComponent | string,
    elementId?: string,
  ): PageKeyboardLayer | ElementKeyboard {
    if (typeof ownerOrLayer !== "string") {
      let layer = this.state.pageLayerEelementsKeyboards.get(ownerOrLayer);
      if (!layer) {
        layer = this.createKeyboardLayer();
        this.state.pageLayerEelementsKeyboards.set(ownerOrLayer, layer);
      }
      return layer;
    }

    if (!elementId) {
      throw new Error(
        "[keyboard-engine] getLayer: string owner (layerId) requires an elementId. " +
          "Pass getLayer(layerId, elementId).",
      );
    }

    const state = this.state.synchronizedData;
    if (state.layers.length === 0 && state.modalLayers.length === 0) {
      throw new Error(
        "[keyboard-engine] getLayer: string owner requires active layers/modals. " +
          "Use getLayer(component) when no layers exist.",
      );
    }

    let layerData = this.state.layersKeyboardMap.get(ownerOrLayer);
    if (!layerData) {
      layerData = {
        layerId: ownerOrLayer,
        pendingSequence: { fromElementId: null, pendingSequence: null },
        elementKeyboards: new Map(),
      };
      this.state.layersKeyboardMap.set(ownerOrLayer, layerData);
    }

    let elementKeyboard = layerData.elementKeyboards.get(elementId);
    if (!elementKeyboard) {
      elementKeyboard = {
        bindings: [],
        penetrationKeys: [],
        stoppedKeys: [],
        globalKeyOverrides: new Set(),
        focusTargets: new Map(),
        defaultFocusOrder: [],
        currentFocusIds: [],
        defaultTargets: new Map(),
        actionKeysMap: new Map(),
        sequences: new Map(),
        elementId,
        associatedLayer: ownerOrLayer,
        allowedKeys: [],
        missListener: {
          onMiss: null,
          onMissOptions: null
        }
      };
      layerData.elementKeyboards.set(elementId, elementKeyboard);
    }
    return elementKeyboard;
  }

  /**
   * Return the topmost page component in the current path.
   *
   * Used as a graceful fallback when resolving the binding target, so
   * page-level bindings remain stable even while a layer is present.
   */
  getTopPage() {
    const data = this.state.synchronizedData;
    if (data.pagePath.length === 0) return null;
    return data.pagePath[data.pagePath.length - 1];
  }

  /**
   * Push a new owner onto the stack so bindings inside a layer/modal element
   * are attributed to that element's layer even when it is not the top layer.
   */
  pushOwner(owner: TComponent | string) {
    this.state.ownerStackRef = [...this.state.ownerStackRef, owner];
  }

  /**
   * Remove the most recent matching owner from the stack.
   */
  popOwner(owner: TComponent | string) {
    const stack = this.state.ownerStackRef;
    const idx = stack.lastIndexOf(owner);
    if (idx !== -1) {
      this.state.ownerStackRef = [
        ...stack.slice(0, idx),
        ...stack.slice(idx + 1),
      ];
    }
  }

  getCurrentOwner(): TComponent | string | null {
    const stack = this.state.ownerStackRef;
    if (stack.length > 0) return stack[stack.length - 1];

    const data = this.state.synchronizedData;
    if (data.modalLayers.length > 0) {
      return data.modalLayers[data.modalLayers.length - 1].layerId;
    }
    if (data.layers.length > 0) {
      return data.layers[data.layers.length - 1].layerId;
    }
    if (data.pagePath.length === 0) return null;
    return data.pagePath[data.pagePath.length - 1];
  }

  notifyFocusChange() {
    this.state.focusSubscribersRef.forEach((fn) => fn());
  }

  clearPendingSequence(layer: PageKeyboardLayer | ElementKeyboard) {
    if ("associatedLayer" in layer) {
      const from = this.state.layersKeyboardMap.get(layer.associatedLayer);
      if (
        from?.pendingSequence.pendingSequence &&
        from.pendingSequence.fromElementId === layer.elementId
      ) {
        const timer = from.pendingSequence.pendingSequence.timer;
        clearTimeout(timer);
        from.pendingSequence = {
          fromElementId: null,
          pendingSequence: null,
        };
      }
    } else {
      if (layer.pendingSequence) {
        const timer = layer.pendingSequence.timer;
        clearTimeout(timer);
        layer.pendingSequence = null;
      }
    }
  }

  /**
   * Get or lazily create a focus target on a layer.
   *
   * The first target registered on a layer (in the default group or any
   * named group) is auto-activated and triggers {@link notifyFocusChange}
   * — this is why a screen with a single focus target needs no explicit
   * `focusSet` call.
   */
  getOrCreateFocusTarget(
    layer: PageKeyboardLayer | ElementKeyboard,
    focusId: string,
    group?: string,
  ): FocusTarget {
    if (group && typeof group === "string") {
      let g = layer.focusTargets.get(group);

      if (!g) {
        const target: FocusTarget = {
          bindings: [],
          stoppedKeys: [],
          penetrationKeys: [],
          actionKeysMap: new Map(),
          allowedKeys: [],
        };

        g = {
          map: new Map([[focusId, target]]),
          order: [focusId],
        };
        layer.focusTargets.set(group, g);

        if (layer.currentFocusIds.length === 0) {
          layer.currentFocusIds.push({ fromGroup: group, id: focusId });
          this.notifyFocusChange();
        }

        return target;
      }

      let target = g.map.get(focusId);
      if (!target) {
        target = {
          bindings: [],
          stoppedKeys: [],
          penetrationKeys: [],
          actionKeysMap: new Map(),
          allowedKeys: [],
        };

        g.map.set(focusId, target);
        g.order.push(focusId);
      }

      if (layer.currentFocusIds.length === 0) {
        layer.currentFocusIds.push({ fromGroup: group, id: focusId });
        this.notifyFocusChange();
      }

      return target;
    }
    let target = layer.defaultTargets.get(focusId);
    if (!target) {
      target = {
        bindings: [],
        penetrationKeys: [],
        stoppedKeys: [],
        actionKeysMap: new Map(),
        allowedKeys: [],
      };
      layer.defaultTargets.set(focusId, target);
      layer.defaultFocusOrder.push(focusId);
      if (layer.currentFocusIds.length === 0) {
        layer.currentFocusIds.push({
          fromGroup: defaultTargetsSymbol,
          id: focusId,
        });
        this.notifyFocusChange();
      }
    }
    return target;
  }

  readLayer(screenComponent: TComponent): PageKeyboardLayer | undefined;
  readLayer(layerId: string): LayerKeyboardLayer | undefined;
  readLayer(layerId: string, elementId: string): ElementKeyboard | undefined;
  readLayer(
    ownerOrLayer: TComponent | string,
    elementId?: string,
  ): PageKeyboardLayer | LayerKeyboardLayer | ElementKeyboard | undefined {
    if (typeof ownerOrLayer !== "string") {
      return this.state.pageLayerEelementsKeyboards.get(ownerOrLayer);
    }
    if (elementId) {
      return this.state.layersKeyboardMap
        .get(ownerOrLayer)
        ?.elementKeyboards.get(elementId);
    }
    return this.state.layersKeyboardMap.get(ownerOrLayer);
  }

  /**
   * Register a listener called whenever the active focus target changes
   * (via `focusSet`, `focusNext`, `focusPrev`, `focusUnregister`,
   * `activateFocusGroup`, or `kickFocusGroup`). Use it to re-render
   * focus indicators.
   *
   * @returns An unsubscribe function.
   */
  subscribeFocus(listener: () => void) {
    this.state.focusSubscribersRef.add(listener);
    return () => {
      this.state.focusSubscribersRef.delete(listener);
    };
  }

  private resolveKeyboardLayer(
    owner: TComponent | string,
    element?: string,
  ): { layer: PageKeyboardLayer | ElementKeyboard; name: string } {
    if (typeof owner !== "string") {
      const layer = this.state.pageLayerEelementsKeyboards.get(owner);
      const name =
        (owner as any).displayName || (owner as any).name || "Unknown";
      if (!layer) {
        throw new Error(
          `[keyboard-engine] no keyboard layer found for "${name}". ` +
            "Did you forget to wrap the screen in a keyboard provider?",
        );
      }
      return { layer, name: name };
    }

    const elementId = element;
    if (!elementId) {
      throw new Error(
        `[keyboard-engine] owner "${owner}" is a layer ID, but no element was specified. ` +
          'Pass { element: "elementId" } to focusSet options.',
      );
    }

    const layer = this.state.layersKeyboardMap
      .get(owner)
      ?.elementKeyboards.get(elementId);
    if (!layer) {
      throw new Error(
        `[keyboard-engine] no keyboard layer found for layer "${owner}" element "${elementId}". ` +
          "Did you forget to call boundKeyboard for this element?",
      );
    }
    return { layer, name: `${owner}/${elementId}` };
  }

  /**
   * Activate a named focus target on the current owner's layer.
   *
   * Targets are lazily created — the first binding with a given `focusId`
   * (via `boundKeyboard` `{ focusId }`) creates the target, so `focusSet`
   * must be called after at least one binding is registered. The group's
   * previous active entry (if any) is replaced, and any pending sequence
   * on the layer is cleared.
   *
   * @returns `true` if the target was activated, `false` on any no-op path
   *          (no owner, unresolved layer, unknown group, or target not found).
   */
  focusSet(focusId: string, group?: string): boolean;
  focusSet(focusId: string, options?: FocusSetOptions): boolean;
  focusSet(focusId: string, groupOrOptions?: string | FocusSetOptions): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }
    this.clearPendingSequence(layer);

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g || !g.map.has(focusId)) return false;

      const has = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );
      if (has !== -1) {
        layer.currentFocusIds.splice(has, 1);
      }
      layer.currentFocusIds.push({ id: focusId, fromGroup: group });
      this.notifyFocusChange();
      return true;
    }

    if (!layer.defaultTargets.has(focusId)) return false;

    const idx = layer.currentFocusIds.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );
    if (idx !== -1) {
      layer.currentFocusIds.splice(idx, 1);
    }
    layer.currentFocusIds.push({
      id: focusId,
      fromGroup: defaultTargetsSymbol,
    });
    this.notifyFocusChange();
    return true;
  }

  private replaceFocusGroup(
    inCurrentGroupId: string,
    order: string[],
    currentFocusIds: {
      id: string;
      fromGroup: string | typeof defaultTargetsSymbol;
    }[],
    idx: number,
    group: string | null,
    next: boolean,
  ) {
    let inOrderIndex = order.indexOf(inCurrentGroupId);
    inOrderIndex = next
      ? (inOrderIndex + 1) % order.length
      : (inOrderIndex - 1 + order.length) % order.length;

    const result = order[inOrderIndex];
    currentFocusIds.splice(idx, 1);
    currentFocusIds.push({
      id: result,
      fromGroup: group ?? defaultTargetsSymbol,
    });
  }

  /**
   * Cycle to the next focus target in the group's registration order,
   * wrapping around at the end (Tab semantics).
   *
   * When `autoTab` is enabled, the pipeline calls this automatically on
   * Tab; otherwise developers bind Tab and call it themselves. Only
   * switches the active target — a group with no current focus is left
   * untouched.
   *
   * @returns `true` if the active target moved, `false` on any no-op path
   *          (no owner, unresolved layer, unknown group, or no active target
   *          in the group).
   */
  focusNext(group?: string): boolean;
  focusNext(options?: FocusSetOptions): boolean;
  focusNext(groupOrOptions?: string | FocusSetOptions): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }
    this.clearPendingSequence(layer);

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) return false;

      const idx = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );
      if (idx === -1) return false;

      const inCurrentGroup = layer.currentFocusIds[idx];
      this.replaceFocusGroup(
        inCurrentGroup.id,
        g.order,
        layer.currentFocusIds,
        idx,
        group,
        true,
      );
      this.notifyFocusChange();
      return true;
    }

    const currents = layer.currentFocusIds;
    const index = currents.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );
    if (index === -1) return false;

    const inCurrentGroup = currents[index];
    this.replaceFocusGroup(
      inCurrentGroup.id,
      layer.defaultFocusOrder,
      layer.currentFocusIds,
      index,
      null,
      true,
    );
    this.notifyFocusChange();
    return true;
  }

  /**
   * Cycle to the previous focus target in the group's registration order,
   * wrapping around at the end (Shift+Tab semantics). See
   * {@link focusNext} for the group parameter behavior.
   *
   * @returns `true` if the active target moved, `false` on any no-op path
   *          (see {@link focusNext}).
   */
  focusPrev(group?: string): boolean;
  focusPrev(options?: FocusSetOptions): boolean;
  focusPrev(groupOrOptions?: string | FocusSetOptions): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }
    this.clearPendingSequence(layer);

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) return false;

      const idx = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );
      if (idx === -1) return false;

      const inCurrentGroup = layer.currentFocusIds[idx];
      this.replaceFocusGroup(
        inCurrentGroup.id,
        g.order,
        layer.currentFocusIds,
        idx,
        group,
        false,
      );
      this.notifyFocusChange();
      return true;
    }

    const currents = layer.currentFocusIds;
    const index = currents.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );
    if (index === -1) return false;

    const inCurrentGroup = currents[index];
    this.replaceFocusGroup(
      inCurrentGroup.id,
      layer.defaultFocusOrder,
      layer.currentFocusIds,
      index,
      null,
      false,
    );
    this.notifyFocusChange();
    return true;
  }

  /**
   * Return the currently active focus target, or a tagged-union result
   * when there is no owner (`{ noOwner: true }`), no layer for the owner
   * (`{ noLayer: true }`), or no active focus target (`{ noFound: true }`).
   * An unregistered group also yields `{ noFound: true }`, so reads are safe
   * before any binding registers the group.
   * Check `.result?.id` for the active focus id.
   */
  focusCurrent(group?: string): FocusCurrentResult;
  focusCurrent(options?: FocusSetOptions): FocusCurrentResult;
  focusCurrent(groupOrOptions?: string | FocusSetOptions): FocusCurrentResult {
    const owner = this.getCurrentOwner();
    if (!owner) {
      return { noOwner: true };
    }

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return { noLayer: true };
    }

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) {
        return { noFound: true };
      }

      const index = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );

      if (index === -1) {
        return { noFound: true };
      }
      return { result: layer.currentFocusIds[index] };
    }

    const index = layer.currentFocusIds.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );

    if (index === -1) {
      return { noFound: true };
    }
    return { result: layer.currentFocusIds[index] };
  }

  /**
   * Remove a focus target from the current owner's layer.
   *
   * If the removed target was the active one for its group, the first
   * remaining target (in registration order) is auto-activated; when no
   * targets remain, the group's focus slot is cleared. Silently no-ops
   * when the target, group, or layer is absent.
   *
   * @returns `true` if a focus target was removed, `false` on any no-op
   *          path (no owner, unresolved layer, unknown group or target).
   */
  focusUnregister(focusId: string, group?: string): boolean;
  focusUnregister(focusId: string, options?: FocusSetOptions): boolean;
  focusUnregister(
    focusId: string,
    groupOrOptions?: string | FocusSetOptions,
  ): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) return false;

      const target = g.map.get(focusId);
      if (!target) return false;

      const index = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group && each.id === focusId,
      );
      const wasFocused = index !== -1;

      g.map.delete(focusId);
      g.order = g.order.filter((id) => id !== focusId);

      if (wasFocused) {
        layer.currentFocusIds.splice(index, 1);
        const result = g.order.length > 0 ? g.order[0] : null;
        if (result) {
          layer.currentFocusIds.push({
            id: result,
            fromGroup: group,
          });
        }
        this.notifyFocusChange();
      }
    } else {
      const target = layer.defaultTargets.get(focusId);
      if (!target) return false;

      const index = layer.currentFocusIds.findIndex(
        (each) =>
          each.fromGroup === defaultTargetsSymbol && each.id === focusId,
      );
      const wasFocused = index !== -1;

      layer.defaultTargets.delete(focusId);
      layer.defaultFocusOrder = layer.defaultFocusOrder.filter(
        (each) => each !== focusId,
      );

      if (wasFocused) {
        layer.currentFocusIds.splice(index, 1);
        const result =
          layer.defaultFocusOrder.length > 0
            ? layer.defaultFocusOrder[0]
            : null;
        if (result) {
          layer.currentFocusIds.push({
            id: result,
            fromGroup: defaultTargetsSymbol,
          });
        }
        this.notifyFocusChange();
      }
    }

    return true;
  }

  /**
   * Activate a focus target in a group that currently has no active focus —
   * lazy initial activation without overwriting.
   *
   * Pushes `{ id: focusId, fromGroup: group }` into the layer's
   * `currentFocusIds` array and notifies focus subscribers on success.
   * Does NOT replace an existing active entry — unlike {@link focusSet},
   * it is idempotent for already-active groups.
   *
   * @returns `true` if the target was activated; `false` when the current
   *          owner has no layer, the group is not registered on the layer,
   *          the `focusId` is not found within the group, or the group
   *          already has an active focus target (use {@link focusSet} to
   *          switch it).
   *
   * @example
   * ```ts
   * engine.boundKeyboard('*', handleName,  { focusId: { group: 'field', focusId: 'name' } });
   * engine.boundKeyboard('*', handleEmail, { focusId: { group: 'field', focusId: 'email' } });
   * engine.boundKeyboard('tab', handleTab, { focusId: { group: 'nav',   focusId: 'tabs' } });
   *
   * // Give each group its initial focus — only succeeds for groups that
   * // are not yet active. 'field' was already auto-activated when its
   * // first target was registered, so this call returns false for it.
   * engine.activateFocusGroup('name', 'field');  // false — already active
   * engine.activateFocusGroup('tabs', 'nav');    // true  — first activation
   * ```
   */
  activateFocusGroup(focusId: string, group?: string): boolean;
  activateFocusGroup(focusId: string, options?: FocusSetOptions): boolean;
  activateFocusGroup(
    focusId: string,
    groupOrOptions?: string | FocusSetOptions,
  ): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) return false;

      const target = g.map.get(focusId);
      if (!target) return false;

      const inCurrentIndex = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );

      if (inCurrentIndex === -1) {
        layer.currentFocusIds.push({
          id: focusId,
          fromGroup: group,
        });
        this.notifyFocusChange();
        return true;
      }
      return false;
    }

    const target = layer.defaultTargets.get(focusId);
    if (!target) return false;

    const inCurrentIndex = layer.currentFocusIds.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );

    if (inCurrentIndex === -1) {
      layer.currentFocusIds.push({
        id: focusId,
        fromGroup: defaultTargetsSymbol,
      });
      this.notifyFocusChange();
      return true;
    }
    return false;
  }

  /**
   * Remove an entire group's active focus entry from the current owner's
   * layer — the group holds no active focus afterward.
   *
   * Only the group's active slot is removed: registered focus targets and
   * their bindings stay intact, and the group can be re-activated later
   * via {@link activateFocusGroup} or {@link focusSet}. To remove
   * individual targets instead, use `focusUnregister`. Subscribers are
   * notified on successful removal.
   *
   * @returns `true` if the group's entry was removed from
   *          `currentFocusIds`; `false` when the owner has no layer, the
   *          group is not registered on the layer, or the group is not
   *          currently active.
   *
   * @example
   * ```ts
   * engine.boundKeyboard('*', handleInput, { focusId: { group: 'field', focusId: 'name' } });
   *
   * // Deactivate the entire field group so no field receives keys
   * engine.kickFocusGroup('field');  // true — group was active, now removed
   * engine.kickFocusGroup('field');  // false — group is no longer active (safe no-op)
   * ```
   */
  kickFocusGroup(group?: string): boolean;
  kickFocusGroup(options?: FocusSetOptions): boolean;
  kickFocusGroup(groupOrOptions?: string | FocusSetOptions): boolean {
    const owner = this.getCurrentOwner();
    if (!owner) return false;

    const group =
      typeof groupOrOptions === "string"
        ? groupOrOptions
        : groupOrOptions?.group;
    const element =
      typeof groupOrOptions !== "string" ? groupOrOptions?.element : undefined;

    let layer: PageKeyboardLayer | ElementKeyboard;
    try {
      layer = this.resolveKeyboardLayer(owner, element).layer;
    } catch {
      return false;
    }

    if (group) {
      const g = layer.focusTargets.get(group);
      if (!g) return false;

      const inCurrentIndex = layer.currentFocusIds.findIndex(
        (each) => each.fromGroup === group,
      );

      if (inCurrentIndex !== -1) {
        layer.currentFocusIds.splice(inCurrentIndex, 1);
        this.notifyFocusChange();
        return true;
      }
      return false;
    }

    const defaultInCurrentIndex = layer.currentFocusIds.findIndex(
      (each) => each.fromGroup === defaultTargetsSymbol,
    );

    if (defaultInCurrentIndex !== -1) {
      layer.currentFocusIds.splice(defaultInCurrentIndex, 1);
      this.notifyFocusChange();
      return true;
    }
    return false;
  }
}
