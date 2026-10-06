import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  measureElement,
  useBoxMetrics,
  useWindowSize,
  type DOMElement,
} from "ink";
import {
  KeyboardContext,
  KeyboardContextValue,
  SequenceReactOptions,
  type BoundKeyboardReactOptions,
} from "./context.js";
import { LayerElementContext } from "../screen/LayerElementContext.js";
import { ModalLayerElementContext } from "../screen/ModalLayerElementContext.js";
import type {
  RegionFocusEntry,
  RegionFocusMap,
} from "../screen/types/region-focus.js";
import type {
  AllowModalOptions,
  KeyHandler,
  ModalMissCallback,
  ModalMissOptions,
  PenetrationOptions,
  StopOptions,
  FocusRef,
  FocusSetOptions,
  MouseRegionCallbacks,
  MouseRegionRect,
} from "@cartridge-engine/keyboard-engine";
import { ROOT_MOUSE_LAYER_ID } from "@cartridge-engine/keyboard-engine";
import {
  ScreenSystemContext,
  type ScreenSystemContextValue,
} from "../screen/context.js";

/** Per-map registration stacks, so a ref shared by several bindings keeps the
 *  most recently registered LIVE entry and is only dropped when the last
 *  registration is released. */
const regionFocusEntries = new WeakMap<
  RegionFocusMap,
  Map<RefObject<DOMElement | null>, RegionFocusEntry[]>
>();

/**
 * Resolve the regionFocus map that owns the current scope. Priority mirrors
 * keyboard ownership: a layer element beats a modal element, which beats the
 * current page root.
 */
function resolveRegionFocusMap(
  layerCtx: { regionFocus: RegionFocusMap } | null,
  modalCtx: { regionFocus: RegionFocusMap } | null,
  screenCtx: ScreenSystemContextValue | null,
): RegionFocusMap | undefined {
  if (layerCtx) return layerCtx.regionFocus;
  if (modalCtx) return modalCtx.regionFocus;
  const topPage = screenCtx?.currentPath[screenCtx.currentPath.length - 1];
  return topPage?.regionFocus;
}

/**
 * Register a mouse-driven focus target in the regionFocus map that owns the
 * current scope. Priority mirrors keyboard ownership: a layer element beats
 * a modal element, which beats the current page root.
 *
 * A missing ref or focusId is a no-op. When several bindings share one ref,
 * the map holds the most recently registered LIVE entry — the one a click
 * forwards to.
 *
 * @returns A release function that pops this registration; the map then falls
 *          back to the previous live entry, or loses the ref when none remain.
 *          Returns `undefined` when nothing was registered.
 */
function registerRegionFocus(
  layerCtx: { regionFocus: RegionFocusMap } | null,
  modalCtx: { regionFocus: RegionFocusMap } | null,
  screenCtx: ScreenSystemContextValue | null,
  ref: RefObject<DOMElement | null> | undefined,
  focusId: string | FocusRef | undefined,
): (() => void) | undefined {
  if (!ref || !focusId) return undefined;
  const map = resolveRegionFocusMap(layerCtx, modalCtx, screenCtx);
  if (!map) return undefined;

  let stacks = regionFocusEntries.get(map);
  if (!stacks) {
    stacks = new Map();
    regionFocusEntries.set(map, stacks);
  }
  let stack = stacks.get(ref);
  if (!stack) {
    stack = [];
    stacks.set(ref, stack);
  }

  const entry: RegionFocusEntry = { focusId };
  stack.push(entry);
  map.set(ref, entry);

  return () => {
    const index = stack.indexOf(entry);
    if (index === -1) return; // already released
    stack.splice(index, 1);

    const top = stack[stack.length - 1];
    if (top) {
      map.set(ref, top);
    } else {
      map.delete(ref);
      stacks.delete(ref);
      if (stacks.size === 0) regionFocusEntries.delete(map);
    }
  };
}

/**
 * Forward keyboard focus to the focusId recorded for a regionFocus entry.
 * A plain string targets the default focus group; a {@link FocusRef} targets
 * a named group. Inside a layer/modal element the owning element id rides
 * along (focus state is per-element there), mirroring `useKeyboard`'s
 * `withFocusOptions` injection. Missing ctx or entry is a no-op.
 */
function applyRegionFocus(
  ctx: KeyboardContextValue | null,
  entry: RegionFocusEntry | undefined,
  elementId?: string,
): void {
  if (!ctx || !entry) return;
  if (typeof entry.focusId === "string") {
    ctx.focusSet(entry.focusId, elementId ? { element: elementId } : undefined);
  } else {
    ctx.focusSet(entry.focusId.focusId, {
      group: entry.focusId.group,
      ...(elementId ? { element: elementId } : {}),
    });
  }
}

/**
 * Compose the engine's binding unbind with the regionFocus release so a
 * single call cleans up both. Guarded so it stays idempotent — the engine
 * unbind is safe to call repeatedly, and the regionFocus counter must not be
 * decremented twice for one binding.
 */
function composeUnbind(
  removeRegionFocus: (() => void) | undefined,
  unbind: () => void,
): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    removeRegionFocus?.();
    unbind();
  };
}

/**
 * Access the keyboard API from within a React component.
 *
 * Bindings are scoped to the current layer element automatically. When this
 * hook is called inside a layer/modal element, the element's own layer id is
 * pushed onto the engine owner stack so bindings are attributed to that
 * layer even when it is not the top layer.
 *
 * Must be used inside a {@link KeyboardProvider}.
 *
 * When `boundKeyboard` is given both a `ref` (the element also registered via
 * {@link useMouseRegion}) and a `focusId`, the ref → focusId mapping is
 * recorded so that clicking the region forwards keyboard focus to that
 * `focusId` — the mouse and the keyboard then converge on the same focus
 * target. See {@link BoundKeyboardReactOptions}.
 *
 * @throws If no provider is found in the component tree.
 *
 * @example
 * Bind a key with a mode restriction. `boundKeyboard` returns an unbind
 * function — return it from the effect so the binding is removed on unmount
 * (and re-registered on re-render, picking up fresh closures).
 * ```tsx
 * function MyScreen() {
 *   const { boundKeyboard } = useKeyboard();
 *
 *   useEffect(() => {
 *     return boundKeyboard(['ctrl+s'], () => save(), { mode: 'insert' });
 *   }, []);
 *
 *   return <Text>Press Ctrl+S to save</Text>;
 * }
 * ```
 *
 * @example
 * Tie a key to a clickable element: clicking the box or pressing its key both
 * act on the same focus target.
 * ```tsx
 * function ClickableButton() {
 *   const { boundKeyboard } = useKeyboard();
 *   const ref = useMouseRegion({ onClick: doSomething });
 *
 *   useEffect(() => {
 *     return boundKeyboard(['enter'], doSomething, { ref, focusId: 'save-btn' });
 *   }, [boundKeyboard]);
 *
 *   return <Box ref={ref}>Save</Box>;
 * }
 * ```
 */
export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  const layerCtx = useContext(LayerElementContext);
  const modalCtx = useContext(ModalLayerElementContext);
  if (!ctx) {
    throw new Error(
      "[ink-cartridge] useKeyboard() must be called inside a <KeyboardProvider>.",
    );
  }

  const screenCtx = useContext(ScreenSystemContext);
  const topPageComponent =
    screenCtx?.currentPath[screenCtx.currentPath.length - 1]?.component ?? null;

  // Inside a layer/modal element the owner is the layer id; on a plain page
  // it is the page component itself. With the page in the stack, page-level
  // bindings never land on whatever layer element happens to be on top.
  const ownerId =
    layerCtx?.layer.layerId ??
    modalCtx?.modalLayer.layerId ??
    topPageComponent;
  const elementId = layerCtx?.id ?? modalCtx?.id;
  const { _pushOwner, _popOwner } = ctx;
  const ownerPushedRef = useRef(false);

  useEffect(() => {
    if (!ownerId) return;
    if (!ownerPushedRef.current) {
      _pushOwner(ownerId);
      ownerPushedRef.current = true;
    }
    return () => {
      _popOwner(ownerId);
      ownerPushedRef.current = false;
    };
  }, [_popOwner, _pushOwner, ownerId]);

  const wrapped = useMemo<KeyboardContextValue>(() => {
    // Bindings and focus calls resolve their target through the engine's
    // owner stack. The mount-time effect above pushes this element's owner
    // once, but sibling layer elements coexist: after a re-render forces a
    // re-bind (e.g. a layer reorder), the stack top belongs to the LAST
    // mounted sibling, not necessarily to this element. Re-push our own
    // owner for the duration of each call so registration always lands on
    // our own layer.
    // The try/finally pairing is load-bearing, not defensive polish: engine
    // registrations throw on user errors (unknown actionId, times < 1,
    // cover:false global-key conflicts), and the host often SURVIVES those
    // throws (user try/catch, error boundaries, expect().toThrow()). A throw
    // must not strand our owner on the stack top — the leftover would
    // silently reroute every later rebind, hiding the real error behind
    // "bindings landed on the wrong layer". finally rather than catch keeps
    // the cleanup unconditional while letting the original error propagate
    // untouched — a catch here would swallow it.
    // @2026-08-23 v5.2.2
    const withOwner = <T>(run: () => T): T => {
      if (!ownerId) return run();
      _pushOwner(ownerId);
      try {
        return run();
      } finally {
        _popOwner(ownerId);
      }
    };

    const withElement = <T extends { elementId?: string }>(
      options?: T,
    ): T | undefined => {
      if (!elementId) return options;
      if (!options) return { elementId } as T;
      if (options.elementId) return options;
      return { ...options, elementId };
    };

    const withFocusOptions = (
      groupOrOptions?: string | FocusSetOptions,
    ): string | FocusSetOptions | undefined => {
      if (!elementId) return groupOrOptions;
      if (typeof groupOrOptions === "string") return groupOrOptions;
      return {
        ...groupOrOptions,
        element: groupOrOptions?.element ?? elementId,
      };
    };

    const boundKeyboard = ((
      keysOrActionId: string | string[],
      handlerOrOptions: KeyHandler | string | BoundKeyboardReactOptions,
      maybeOptions?: BoundKeyboardReactOptions,
    ) => {
      if (
        typeof keysOrActionId === "string" &&
        typeof handlerOrOptions !== "function" &&
        typeof handlerOrOptions !== "string"
      ) {
        const removeRegionFocus = registerRegionFocus(
          layerCtx,
          modalCtx,
          screenCtx,
          handlerOrOptions?.ref,
          handlerOrOptions?.focusId,
        );
        const unbind = withOwner(() =>
          ctx.boundKeyboard(keysOrActionId, withElement(handlerOrOptions)),
        );
        return composeUnbind(removeRegionFocus, unbind);
      }
      if (typeof handlerOrOptions === "string") {
        const removeRegionFocus = registerRegionFocus(
          layerCtx,
          modalCtx,
          screenCtx,
          maybeOptions?.ref,
          maybeOptions?.focusId,
        );
        const unbind = withOwner(() =>
          ctx.boundKeyboard(
            keysOrActionId,
            handlerOrOptions,
            withElement(maybeOptions),
          ),
        );
        return composeUnbind(removeRegionFocus, unbind);
      }

      const removeRegionFocus = registerRegionFocus(
        layerCtx,
        modalCtx,
        screenCtx,
        maybeOptions?.ref,
        maybeOptions?.focusId,
      );
      const unbind = withOwner(() =>
        ctx.boundKeyboard(
          keysOrActionId,
          handlerOrOptions as KeyHandler,
          withElement(maybeOptions),
        ),
      );
      return composeUnbind(removeRegionFocus, unbind);
    }) as KeyboardContextValue["boundKeyboard"];

    const boundSequence = ((
      keysOrActionId: string | string[],
      handlerOrOptions?: KeyHandler | string | SequenceReactOptions,
      maybeOptions?: SequenceReactOptions,
    ) => {
      // Form 3: boundSequence(actionId, options?) — uses the action's preset keys
      if (
        typeof keysOrActionId === "string" &&
        (typeof handlerOrOptions === "undefined" ||
          typeof handlerOrOptions === "object")
      ) {
        const removeRegionFocus = registerRegionFocus(
          layerCtx,
          modalCtx,
          screenCtx,
          handlerOrOptions?.ref,
          handlerOrOptions?.focusId,
        );
        const unbind = withOwner(() =>
          ctx.boundSequence(keysOrActionId, withElement(handlerOrOptions)),
        );
        return composeUnbind(removeRegionFocus, unbind);
      }

      // Form 2: boundSequence(keys, actionId, options?) — explicit keys,
      // sequence action by id (the engine resolves the action's callback)
      if (
        typeof keysOrActionId !== "string" &&
        typeof handlerOrOptions === "string"
      ) {
        const removeRegionFocus = registerRegionFocus(
          layerCtx,
          modalCtx,
          screenCtx,
          maybeOptions?.ref,
          maybeOptions?.focusId,
        );
        const unbind = withOwner(() =>
          ctx.boundSequence(
            keysOrActionId,
            handlerOrOptions,
            withElement(maybeOptions),
          ),
        );
        return composeUnbind(removeRegionFocus, unbind);
      }

      // Form 1: boundSequence(keys, handler, options?) — explicit keys and callback
      const removeRegionFocus = registerRegionFocus(
        layerCtx,
        modalCtx,
        screenCtx,
        maybeOptions?.ref,
        maybeOptions?.focusId,
      );
      const unbind = withOwner(() =>
        ctx.boundSequence(
          keysOrActionId,
          handlerOrOptions as KeyHandler,
          withElement(maybeOptions),
        ),
      );
      return composeUnbind(removeRegionFocus, unbind);
    }) as KeyboardContextValue["boundSequence"];

    return {
      ...ctx,
      boundKeyboard,
      penetration: (keys: string[], options?: PenetrationOptions) =>
        withOwner(() => ctx.penetration(keys, withElement(options))),
      stop: (keys: string[], options?: StopOptions) =>
        withOwner(() => ctx.stop(keys, withElement(options))),
      allowModal: (keys: string[], options?: AllowModalOptions) =>
        withOwner(() => ctx.allowModal(keys, withElement(options))),
      boundSequence,
      useModalMissListener: (
        cb: ModalMissCallback,
        options?: ModalMissOptions,
      ) =>
        withOwner(() =>
          ctx.useModalMissListener(cb, withElement(options)),
        ),
      focusSet: (focusId: string, groupOrOptions?: string | FocusSetOptions) =>
        withOwner(() => ctx.focusSet(focusId, withFocusOptions(groupOrOptions))),
      focusNext: (groupOrOptions?: string | FocusSetOptions) =>
        withOwner(() => ctx.focusNext(withFocusOptions(groupOrOptions))),
      focusPrev: (groupOrOptions?: string | FocusSetOptions) =>
        withOwner(() => ctx.focusPrev(withFocusOptions(groupOrOptions))),
      focusCurrent: (groupOrOptions?: string | FocusSetOptions) =>
        withOwner(() => ctx.focusCurrent(withFocusOptions(groupOrOptions))),
      focusUnregister: (
        focusId: string,
        groupOrOptions?: string | FocusSetOptions,
      ) =>
        withOwner(() =>
          ctx.focusUnregister(focusId, withFocusOptions(groupOrOptions)),
        ),
      activateFocusGroup: (
        focusId: string,
        groupOrOptions?: string | FocusSetOptions,
      ) =>
        withOwner(() =>
          ctx.activateFocusGroup(focusId, withFocusOptions(groupOrOptions)),
        ),
      kickFocusGroup: (groupOrOptions?: string | FocusSetOptions) =>
        withOwner(() => ctx.kickFocusGroup(withFocusOptions(groupOrOptions))),
    };
  }, [ctx, layerCtx, modalCtx, screenCtx, elementId, ownerId, _pushOwner, _popOwner]);

  return wrapped;
}

/**
 * Track whether a focusable element currently holds focus.
 *
 * Re-renders whenever focus moves; returns `true` while `focusId` is the
 * active focus target (optionally constrained to a focus group).
 *
 * @param focusId        - Id of the focusable element to track.
 * @param groupOrOptions - Focus group name or {@link FocusSetOptions}.
 * @returns `true` when the element currently holds focus.
 *
 * @example
 * Track a `TextInput` — the same `focusId` the input registers with the
 * focus system:
 * ```tsx
 * function LoginForm() {
 *   const focused = useFocusState('username');
 *
 *   return (
 *     <Box flexDirection="column">
 *       <TextInput focusId="username" value={username} onChange={setUsername} />
 *       <Text dimColor>{focused ? 'editing username' : 'press Tab'}</Text>
 *     </Box>
 *   );
 * }
 * ```
 */
export function useFocusState(
  focusId: string,
  groupOrOptions?: string | FocusSetOptions,
): boolean {
  const { focusCurrent, subscribeFocus } = useKeyboard();
  const [isFocused, setIsFocused] = useState<boolean>(
    () => focusCurrent(groupOrOptions).result?.id === focusId,
  );

  useEffect(() => {
    return subscribeFocus(() => {
      setIsFocused(focusCurrent(groupOrOptions).result?.id === focusId);
    });
  }, [focusId, focusCurrent, subscribeFocus, groupOrOptions]);

  return isFocused;
}

/**
 * Register a callback for key presses that miss every modal layer binding.
 *
 * The listener is scoped to the surrounding modal layer element
 * automatically; outside a modal layer the hook does nothing. The listener
 * is removed automatically when the component unmounts or when the callback
 * or options change.
 *
 * @param cb      - Called when a key press is not consumed by any modal
 *                  layer binding.
 * @param options - Additional {@link ModalMissOptions}.
 * @returns A no-op function; actual unsubscription happens in an effect
 *          cleanup.
 *
 * @example
 * Give feedback inside a modal layer when the user presses a key no modal
 * binding handles:
 * ```tsx
 * function HelpModal() {
 *   const [hint, setHint] = useState('');
 *   useModalMissListener(() => setHint('Unknown key — press q to close'));
 *   return <Text>{hint}</Text>;
 * }
 * ```
 */
export function useModalMissListener(
  cb: ModalMissCallback,
  options?: ModalMissOptions,
): () => void {
  const modalCtx = useContext(ModalLayerElementContext);
  const modalId = modalCtx?.id ?? null;
  // The wrapped useModalMissListener carries the withOwner/withElement
  // handling so the listener registers on THIS modal element even when other
  // elements sit above it on the owner stack.
  const { useModalMissListener: subscribe } = useKeyboard();

  useEffect(() => {
    if (!modalId) return;
    const unsub = subscribe(cb, {
      ...options,
      elementId: modalId,
    });
    return unsub;
  }, [subscribe, modalId, cb, options]);

  return () => {};
}

/**
 * Convert an Ink DOM element's measured layout metrics into the 1-based
 * terminal coordinate space used by mouse events.
 *
 * Assumes the live region starts at the terminal top-left (no viewport
 * offset) — true for full-screen apps. If content can be scrolled or offset,
 * the caller must account for the viewport position.
 */
function measureRegion(node: DOMElement): MouseRegionRect {
  const m = measureElement(node);
  return { x: m.x + 1, y: m.y + 1, width: m.width, height: m.height };
}

/**
 * Walk up to the `ink-root` DOM node. Ink's layout listeners are registered
 * on the root node, which is also where `useBoxMetrics` attaches them.
 */
function findRootNode(node: DOMElement | null): DOMElement | undefined {
  if (!node) return undefined;
  if (!node.parentNode) return node.nodeName === "ink-root" ? node : undefined;
  return findRootNode(node.parentNode);
}

export type MouseRegionOptions = {
  layerId?: string;
  regionId?: string;
  priority?: number;
  clickOnFocus?: boolean;
  enterOnFocus?: boolean;
  leaveOffFocus?: boolean;
  /**
   * Ref to register the region under and key the region-focus map with,
   * instead of a hook-created ref. Pass the same ref object you give to
   * `boundKeyboard(..., { ref, focusId })` so a click on the region forwards
   * focus to that binding. Only object refs can key the focus map — a
   * callback ref is rejected (falls back to an internal ref, losing the
   * focus link).
   */
  ref?: RefObject<DOMElement | null>;

  /**
   * When `true`, clicking this region raises the surrounding regular layer
   * above all other layers via `bringLayerToFront` (zIndex = max + 1), before
   * the user's own `onClick` runs. Ineffective on modal layers — while a
   * modal is open it owns all mouse hit-testing, and regular layers never
   * rise above modals — and outside any layer.
   */
  clickOnRise?: boolean;

  /**
   * When `true`, starting a drag on this region raises the surrounding
   * regular layer above all other layers, before the user's own
   * `onDragStart` runs. Same modal/root exclusions as `clickOnRise`.
   */
  dragOnRise?: boolean;

  /**
   * When `true`, a wheel event over this region raises the surrounding
   * regular layer above all other layers, before the user's own `onWheel`
   * runs. Same modal/root exclusions as `clickOnRise`.
   */
  wheelOnRise?: boolean;

  /**
   * When `true`, the mouse entering this region raises the surrounding
   * regular layer above all other layers, before the user's own `onEnter`
   * runs. Combine with `leaveOffRise` to lower the layer again on leave.
   * Same modal/root exclusions as `clickOnRise`.
   */
  enterOnRise?: boolean;

  /**
   * Whether leaving the region restores the layer's initial zIndex (undoes
   * the `enterOnRise` raise). Only applies when `enterOnRise` is set;
   * defaults to `true`.
   */
  leaveOffRise?: boolean;
};

/**
 * Register an Ink element as a mouse region.
 *
 * Attach the returned ref to a `<Box>`. The engine hit-tests xterm-mouse
 * events against the element's measured rectangle and fires the callbacks:
 * `onClick` for clicks, `onWheel` for wheel events, `onEnter`/`onLeave` for
 * hover transitions, and `onDragStart`/`onDragMove`/`onDragEnd` for the drag
 * lifecycle.
 *
 * Clicks and drags are exclusive. A press inside the region arms a drag
 * capture on the pressed region — the drag keeps firing even when the
 * cursor leaves the region — and the first `drag` event promotes the press
 * to a drag, firing `onDragStart` and then `onDragMove`. `onDragEnd` fires
 * on release only when a real drag happened; a plain click fires `onClick`
 * instead and never touches the drag callbacks.
 *
 * The region is attributed to the surrounding layer/modal layer
 * automatically (same layer scoping as {@link useKeyboard}); outside any layer
 * it registers on the shared root layer, hit-tested last. While a modal
 * layer is open it takes over hit-testing exactly like keyboard modal
 * priority — events that miss the modal do not fall through to layers or
 * root regions, so clicking "through" a modal can never trigger the UI
 * underneath.
 *
 * The rect is re-measured and re-registered on every render and on every
 * Ink layout commit, so the hit area stays in sync with the terminal
 * whether the window resizes, content grows, or an ancestor moves (e.g. a
 * draggable modal frame relocating its children) — no re-render of the
 * tracked component required. This covers elements whose absolute position
 * moves while their own relative metrics don't change (a button inside a
 * fixed-width centered menu row, a child control inside a moved frame).
 *
 * Hit priority follows keyboard semantics: modal layers → regular layers →
 * root regions; within a layer, later registration wins unless `priority`
 * overrides. Use a higher `priority` for child controls (e.g. a button
 * inside a panel): React mounts children before parents, so the child
 * would otherwise register first and lose overlap resolution.
 *
 * Must be used inside a {@link KeyboardProvider} with `mouse` enabled.
 *
 * When a `boundKeyboard` call registers this same ref with a `focusId`
 * (e.g. `boundKeyboard(['a'], fn, { ref, focusId })`), clicking the region
 * forwards keyboard focus to that focusId before the user's own `onClick`
 * runs — so a mouse click and a keyboard press converge on the same focus
 * target, and the component can react via {@link useFocusState}. Focus
 * forwarding is enabled by default; pass `clickOnFocus: false` to keep
 * clicks purely on the mouse callbacks.
 *
 * Hover can drive focus too: with `enterOnFocus: true` the region's focusId
 * is activated on mouse enter, and deactivated on leave (via
 * `kickFocusGroup`) — unless `leaveOffFocus: false` keeps it. Note
 * `leaveOffFocus` only takes effect when `enterOnFocus` is set, so a
 * click-only region never loses focus by the cursor leaving it.
 *
 * With `clickOnRise: true`, clicking the region also raises the surrounding
 * regular layer above all other layers (see `bringLayerToFront`) before the
 * user's own `onClick` runs. Modal layers are unaffected — while a modal is
 * open it owns all mouse hit-testing, and regular layers never rise above
 * modals — and regions outside any layer do nothing.
 *
 * @param callbacks - Region callbacks (kept fresh across renders).
 * @param options   - Optional `regionId` (defaults to an auto-generated
 *                    unique id — pass one to control identity, e.g. for
 *                    drag/hover bookkeeping), explicit `layerId` override,
 *                    hit-test `priority` (higher wins on overlap; defaults
 *                    0), `clickOnFocus` (whether a click forwards keyboard
 *                    focus to the region's bound focusId; defaults `true`),
 *                    `clickOnRise` / `dragOnRise` / `wheelOnRise` /
 *                    `enterOnRise` (whether the matching mouse gesture
 *                    raises the surrounding regular layer to the top;
 *                    defaults `false`), `leaveOffRise` (whether a hover
 *                    leave restores the layer's initial zIndex; only applies
 *                    when `enterOnRise` is set; defaults `true`),
 *                    `enterOnFocus` (whether a hover enter forwards focus;
 *                    defaults `false`), `leaveOffFocus` (whether a hover
 *                    leave clears the focus; only applies when
 *                    `enterOnFocus` is set; defaults `true`), and `ref`
 *                    (an object ref to register the region under instead of a
 *                    hook-created one — share it with `boundKeyboard` for
 *                    focus forwarding).
 * @returns A ref to attach to the Ink `<Box>` to track.
 *
 * @example
 * Click, wheel, hover, and drag callbacks:
 * ```tsx
 * const boxRef = useMouseRegion({
 *   onClick: (event, rect) => {
 *     const col = event.x - rect.x - 1; // local cell column (1-cell border)
 *     console.log(`Clicked cell ${col} at ${event.x},${event.y}`);
 *   },
 *   onWheel: (event) => {
 *     if (event.button === 'wheel-up') scrollUp();
 *     if (event.button === 'wheel-down') scrollDown();
 *   },
 *   onEnter: () => setIsHovered(true),
 *   onLeave: () => setIsHovered(false),
 *   onDragStart: () => setIsDragging(true),
 *   onDragMove: (event) => moveTo(event.x, event.y),
 *   onDragEnd: () => setIsDragging(false),
 * });
 * return <Box ref={boxRef}>…</Box>;
 * ```
 */
export function useMouseRegion(
  callbacks: MouseRegionCallbacks,
  options?: MouseRegionOptions,
): RefObject<DOMElement | null> {
  // Use the owner-scoped wrappers from useKeyboard, not the raw context: the
  // click/hover focus calls below must re-push this element's owner, otherwise
  // focusSet resolves against whatever sibling element is on top of the owner
  // stack and silently no-ops.
  const ctx = useKeyboard();
  const layerCtx = useContext(LayerElementContext);
  const modalCtx = useContext(ModalLayerElementContext);
  const screenCtx = useContext(ScreenSystemContext);
  const internalRef = useRef<DOMElement | null>(null);
  // An external ref (e.g. one forwarded through a wrapper component) becomes
  // the region ref itself, so a `boundKeyboard({ ref, focusId })` sharing
  // that same ref object keys the same entry in the focus map and
  // focus-forwarding hits. Fall back to a hook-created ref otherwise.
  const ref = options?.ref ?? internalRef;
  const autoId = useId();

  // Ink's terminal-resize path only re-lays-out and redraws the yoga tree —
  // it does NOT re-render React components. A region's rect is refreshed
  // during render below, which needs a render to run, so without this a
  // static layout (e.g. a centered menu) keeps a stale rect after a resize.
  // Tracking the layout metrics forces this component to re-render on layout
  // commits, which re-measures and re-registers the rect synchronously below.
  useBoxMetrics(ref);

  // `useBoxMetrics` only fires when the element's OWN relative metrics change
  // (`getComputedLayout()` vs. its parent). A button inside a fixed-width,
  // centered row keeps identical relative metrics after a resize while its
  // absolute screen position moves — so no re-render, and the stale rect
  // stays registered until any mouse hit happens to re-render the component.
  // Subscribing to terminal resize re-renders unconditionally, so the
  // re-measure below always runs with the fresh layout.
  useWindowSize();

  const layerId =
    options?.layerId ??
    layerCtx?.layer.layerId ??
    modalCtx?.modalLayer.layerId ??
    ROOT_MOUSE_LAYER_ID;
  // Region identity is NOT the surrounding layer/modal element id — reusing
  // that id would collide for every region in the same layer/modal (the
  // later registration overwrites the earlier one). Default to a unique id
  // per call site; callers pass `regionId` to control identity explicitly.
  const regionId = options?.regionId ?? `mouse:${autoId}`;

  // Forward keyboard focus to the focusId that a boundKeyboard/boundSequence
  // ({ ref, focusId }) registered for this same ref, then run the user's own
  // handler. Click forwards by default; hover forwards only when
  // enterOnFocus is set, and clears on leave unless leaveOffFocus: false.
  // Every *OnRise trigger shares the same two guards: only regular layers
  // participate (modal elements and page regions have no layerCtx), and the
  // zIndex change must go through the screen reducer — mutating the context
  // value directly would bypass useReducer and never reach the keyboard
  // engine.
  const raiseSurroundingLayer = (): void => {
    const layer = layerCtx?.layer;
    if (layer) {
      screenCtx?.bringLayerToFront(layer.layerId);
    }
  };
  const lowerSurroundingLayer = (): void => {
    const layer = layerCtx?.layer;
    if (layer) {
      screenCtx?.restoreLayerZIndex(layer.layerId);
    }
  };
  const regionCallbacks: MouseRegionCallbacks = {
    ...callbacks,
    onEnter: (event, rect) => {
      if (options?.enterOnFocus === true) {
        const map = resolveRegionFocusMap(layerCtx, modalCtx, screenCtx);
        applyRegionFocus(ctx, map?.get(ref), layerCtx?.id ?? modalCtx?.id);
      }

      if (options?.enterOnRise === true) {
        raiseSurroundingLayer();
      }

      callbacks.onEnter?.(event, rect);
    },
    onLeave: (event) => {
      // Only when enterOnFocus is declared will the focus be cleared by default when the mouse leaves;
      // otherwise, if the user has not enabled enterOnFocus but is using clickOnFocus,
      // the focus set after a mouse click will be incorrectly cleared.
      if (
        options?.enterOnFocus === true &&
        (options?.leaveOffFocus === undefined || options.leaveOffFocus === true)
      ) {
        const map = resolveRegionFocusMap(layerCtx, modalCtx, screenCtx);
        if (map) {
          const entry = map.get(ref);
          if (entry) {
            const focusRef = entry.focusId;
            if (typeof focusRef === "string") {
              ctx?.kickFocusGroup();
            } else {
              ctx?.kickFocusGroup({
                group: focusRef.group,
                element: layerCtx?.id ?? modalCtx?.id,
              });
            }
          }
        }
      }

      // Undo the enterOnRise raise on leave by default — mirroring the
      // leaveOffFocus rule above (a click-only region never lowers).
      if (
        options?.enterOnRise === true &&
        (options?.leaveOffRise === undefined || options.leaveOffRise === true)
      ) {
        lowerSurroundingLayer();
      }

      callbacks.onLeave?.(event);
    },
    onClick: (event, rect) => {
      // Because in real-world scenarios,
      // triggering keyboard focus switching after onClick is usually the most common use case,
      // clickOnFocus is enabled by default.
      if (
        options?.clickOnFocus === undefined ||
        options.clickOnFocus === true
      ) {
        const map = resolveRegionFocusMap(layerCtx, modalCtx, screenCtx);
        applyRegionFocus(ctx, map?.get(ref), layerCtx?.id ?? modalCtx?.id);
      }

      if (options?.clickOnRise === true) {
        raiseSurroundingLayer();
      }

      callbacks.onClick?.(event, rect);
    },
    onWheel: (event, rect) => {
      if (options?.wheelOnRise === true) {
        raiseSurroundingLayer();
      }

      callbacks.onWheel?.(event, rect);
    },
    onDragStart: (event, rect) => {
      if (options?.dragOnRise === true) {
        raiseSurroundingLayer();
      }

      callbacks.onDragStart?.(event, rect);
    },
  };

  // Register synchronously during render so the engine never holds a rect
  // from a previous frame: a resize re-renders this component (via
  // useBoxMetrics above) and this runs with the fresh layout — no effect
  // timing gap. Overwrite is idempotent: it preserves registration order
  // and does NOT touch hover/drag state, essential so a dragging window
  // can re-render mid-drag. The first render has no ref node yet; the
  // metrics update right after mount forces a second render that registers.
  const node = ref.current;
  if (node && ctx) {
    ctx.registerMouseRegion({
      layerId,
      regionId: regionId,
      rect: measureRegion(node),
      callbacks: regionCallbacks,
      priority: options?.priority,
    });
  }

  // A region's rect is only re-measured when this component re-renders, but
  // two common re-layouts never trigger that: React skips children whose
  // element reference is unchanged (a draggable frame moving its children),
  // and `useBoxMetrics` only fires when the element's OWN relative metrics
  // change (an element inside a moved ancestor keeps identical relative
  // metrics). The stale rect then wins hit-testing at the old position.
  // Ink fires root layout listeners after every commit (`emitLayoutListeners`
  // in the reconciler's `resetAfterCommit`, once the yoga layout is applied),
  // so subscribe here and re-measure unconditionally — no render needed.
  // `addLayoutListener` is not exported from ink's public entry, so touch the
  // same internal listener set it uses (`internal_layoutListeners`); ink
  // itself iterates it, and `useBoxMetrics` depends on the identical hook.
  useEffect(() => {
    const rootNode = findRootNode(ref.current);
    if (!rootNode) return;
    type LayoutListenerHost = DOMElement & {
      internal_layoutListeners?: Set<() => void>;
    };
    const host = rootNode as LayoutListenerHost;
    const listener = () => {
      const current = ref.current;
      if (current && ctx) {
        ctx.registerMouseRegion({
          layerId,
          regionId: regionId,
          rect: measureRegion(current),
          callbacks: regionCallbacks,
          priority: options?.priority,
        });
      }
    };
    host.internal_layoutListeners ??= new Set();
    host.internal_layoutListeners.add(listener);
    return () => {
      host.internal_layoutListeners?.delete(listener);
    };
  });

  // Unmount cleanup: only runs when the component truly unmounts (or
  // layerId/regionId change), never on plain re-renders — those overwrite
  // the registration above.
  useEffect(() => {
    return () => {
      ctx?.unregisterMouseRegion(layerId, regionId);
    };
  }, [ctx, layerId, regionId]);

  return ref;
}
