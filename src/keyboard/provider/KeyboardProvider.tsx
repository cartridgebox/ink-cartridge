import React, {
	ComponentType,
	ReactNode,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { useInput } from "ink";
import { KeyboardEngine } from "@cartridge-engine/keyboard-engine";
import type {
	KeyboardLayer,
	KeyboardProcessorProps,
	ValueSchema,
} from "@cartridge-engine/keyboard-engine";
import {
	clearShortcutOperations,
	Mouse,
	type MouseOptions,
	type XtermMouseEvent,
} from "@cartridge-engine/keyboard-engine";
import { KeyboardContext, KeyboardContextValue } from "../context.js";
import { MouseReportFilter } from "../mouse-report-filter.js";
import { useScreenSystem } from "../../screen/hook.js";
import { isInkSpecialKey, normalizeKeyNames } from "../keyNormalizer.js";
import type { Layer, ModalLayer } from "../../screen/types/layer.js";
import { getPath } from "../../screen/provider.js";

/**
 * Live engines, one per mounted {@link KeyboardProvider}. Module-level calls
 * resolve against the last registered engine, mirroring the screen system's
 * `_dispatchers`.
 */
const _engine = new Set<KeyboardEngine<ComponentType<any>>>();

/**
 * Register an engine for module-level access. Called by
 * {@link KeyboardProvider}; returns an unregister function for effect cleanup.
 */
export function registerEngine(engine: KeyboardEngine<ComponentType<any>>) {
	_engine.add(engine);
	return () => {
		_engine.delete(engine);
	};
}

/**
 * Return the most recently mounted engine, so owner-independent operations
 * can be driven from module scope (see `moduleApi`).
 *
 * @throws If no {@link KeyboardProvider} is mounted.
 */
export function getEngine(): KeyboardEngine<ComponentType<any>> {
	if (_engine.size === 0) {
		throw new Error(
			`[ink-cartridge] No KeyboardEngine is mounted. Render a <KeyboardProvider> before calling getEngine().`
		);
	}

	return [..._engine][_engine.size - 1];
}

/**
 * Push `owner` onto the mounted engine's owner stack for the duration of
 * `fn`, so a manual `getEngine().boundKeyboard(...)` (or any owner-scoped
 * call) is attributed to that layer/page. The owner is popped in a `finally`
 * so a throw inside `fn` cannot strand it on the stack.
 *
 * @example
 * ```ts
 * withOwner(MyPage, () => getEngine().boundKeyboard(['a'], handler));
 * ```
 */
export function withOwner<T>(owner: ComponentType<any> | string, fn: () => T): T {
	const engine = getEngine();
	engine.pushOwner(owner);
	try {
		return fn();
	} finally {
		engine.popOwner(owner);
	}
}

function toKeyboardLayerState(
	layers: Array<Layer | ModalLayer>,
	currentPath?: React.ComponentType<any>[]
): KeyboardLayer[] {
	return layers.map((layer) => {
		const currentPage =
			currentPath && currentPath.length > 0
				? currentPath[currentPath.length - 1]
				: undefined;

		const activeElements: string[] = [];
		if (!isLayerDormant(layer, currentPage)) {
			for (const [id, element] of layer.elements) {
				if (element.active !== false) {
					activeElements.push(id);
				}
			}
		}

		return {
			layerId: layer.layerId,
			elements: Array.from(layer.elements.keys()),
			activeElements,
		};
	});
}

/**
 * Whether the layer's keyboard bindings stay dormant on the current page.
 *
 * - `ComponentType<any>[]`: dormant while the current page is listed — the
 *   list wins even when it contains the host page.
 * - `true`: dormant on every page except the host page.
 * - `false`: never dormant.
 */
function isLayerDormant(
	layer: Layer | ModalLayer,
	currentPage: React.ComponentType<any> | undefined
): boolean {
	const auto = layer.automaticTakeoverKeyboard;

	if (Array.isArray(auto)) {
		return currentPage !== undefined && auto.includes(currentPage);
	}

	if (auto === true) {
		return (
			layer.hostPage !== null &&
			currentPage !== undefined &&
			currentPage !== layer.hostPage
		);
	}

	return false;
}

/** Props for the keyboard provider. */
export interface KeyboardProviderProps {
	/** The app tree rendered inside the provider. */
	children: ReactNode;

	/**
	 * Custom processors to inject when the engine is created.
	 *
	 * Each entry is positioned by `index` — a 0-based stage slot — or by
	 * `target` + `position`, which places it as a new stage beside the stage
	 * holding that processor id; without either it is appended after all
	 * built-in stages. A processor's own `id` identifies it for later
	 * re-weighting or removal.
	 *
	 * @example
	 * ```tsx
	 * <KeyboardProvider
	 *   processors={[
	 *     { processor: { id: "uppercase", process: uppercase }, index: 0 },
	 *     { processor: { id: "logger", process: logger }, index: 1 },
	 *   ]}
	 * >
	 * ```
	 */
	processors?: KeyboardProcessorProps<ComponentType<any>>[];

	/**
	 * Please enter the mode flag you wish to register directly.
	 *
	 * @example
	 * ```tsx
	 * <KeyboardProvider modes={["insert", "editor"]}>
	 * ```
	 */
	modes?: string[];

	/**
	 * The default mode must be pre-registered in the modes list.
	 */
	defaultMode?: string | null;

	/**
	 * Optional runtime type schema for composition chain value validation.
	 *
	 * @example
	 * ```tsx
	 * <KeyboardProvider valueSchema={{
	 *   times: (v): v is number => typeof v === 'number',
	 *   action: (v): v is number => typeof v === 'number',
	 * }}>
	 * ```
	 */
	valueSchema?: ValueSchema;
	/**
	 * Whether the engine automatically handles Tab / Shift+Tab for focus
	 * rotation. Defaults to `false`.
	 *
	 * When `true`, the engine intercepts Tab/Shift+Tab and cycles focus
	 * automatically. When `false` or omitted, developers must call
	 * `focusNext` / `focusPrev` manually.
	 */
	autoTab?: boolean;

	/**
	 * Enables terminal mouse tracking (wires xterm-mouse into the engine).
	 *
	 * Mouse escape sequences are filtered out of the keyboard stream
	 * automatically, so they never reach `useInput` handlers as garbage
	 * text. Mark any `<Box>` with {@link useMouseRegion} to receive click,
	 * wheel, hover, and drag callbacks.
	 */
	mouse?: boolean;

	/**
	 * Options passed to the internal xterm-mouse `Mouse` instance when `mouse`
	 * is enabled. See `MouseOptions` (e.g. `clickDistanceThreshold`,
	 * `pressStormThreshold`, `degradedDedupDistance`).
	 */
	mouseOptions?: MouseOptions;

	/**
	 * Pre-built engine to use instead of an internally created one. Useful for
	 * sharing an engine across providers or injecting a configured instance in
	 * tests. When omitted a fresh {@link KeyboardEngine} is created and kept
	 * alive across renders via a ref.
	 */
	engine?: KeyboardEngine<ComponentType<any>>;
}

/**
 * Provides the keyboard system to the component tree.
 *
 * Instantiates a {@link KeyboardEngine} (kept alive across renders via a
 * ref, or supplied via the `engine` prop), keeps it in sync with the screen
 * system's layer state, and feeds Ink's key events — and mouse events when
 * `mouse` is enabled — into the pipeline. Must be nested inside a
 * {@link ScenarioManagementProvider}.
 *
 * The engine is registered for module-level access (see `getEngine`,
 * `withOwner`, and the `moduleApi` functions) during render, not only in an
 * effect: React runs child effects before the parent's, so effect-only
 * registration would leave the engine unresolvable for a child that calls the
 * module-level API from its own effect.
 *
 * @param props - See {@link KeyboardProviderProps}.
 *
 * @example
 * The full provider chain. `modes` registers the mode names before any
 * binding can be restricted to them (`defaultMode` must be one of them).
 * With `mouse` enabled, SGR mouse reports are filtered out of the keyboard
 * stream automatically, so they never reach `useInput` handlers as text.
 * ```tsx
 * import { ScenarioManagementProvider, KeyboardProvider, CurrentScreen } from 'ink-cartridge';
 *
 * function App() {
 *   return (
 *     <ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
 *       <KeyboardProvider modes={['normal', 'insert']} defaultMode="normal" mouse>
 *         <CurrentScreen />
 *       </KeyboardProvider>
 *     </ScenarioManagementProvider>
 *   );
 * }
 * ```
 */
export function KeyboardProvider({
	children,
	processors,
	modes,
	defaultMode,
	valueSchema,
	autoTab,
	mouse,
	mouseOptions,
	engine: provideEngine
}: KeyboardProviderProps) {
	const { currentPath, allLayers, allModalLayers } = useScreenSystem();

	const internalRef = useRef<KeyboardEngine<ComponentType<any>> | null>(null);
	if (!internalRef.current) {
		internalRef.current = provideEngine ?? new KeyboardEngine<ComponentType<any>>({
			modes,
			defaultMode: defaultMode ?? undefined,
			processors,
			normalizeKeyNames,
			isNormalChar: isInkSpecialKey,
			valueSchema,
			autoTab,
		});
	}
	const engine = internalRef.current;

	// Register during render — not only in an effect — so a child effect that
	// calls the module-level API resolves the engine: React runs child effects
	// before the parent's. `registerEngine` is idempotent (Set), and the
	// effect still unregisters the engine on unmount.
	registerEngine(engine);
	useEffect(() => registerEngine(engine), [engine]);

	engine.sync({
		pagePath: getPath(currentPath),
		layers: toKeyboardLayerState(allLayers, getPath(currentPath)),
		modalLayers: toKeyboardLayerState(allModalLayers, getPath(currentPath)),
	});

	useEffect(() => {
		engine.cleanLayers();
	}, [currentPath, engine]);
	useEffect(() => {
		engine.cleanOverlayLayers();
	}, [allLayers, engine]);
	useEffect(() => {
		engine.cleanModalLayers();
	}, [allModalLayers, engine]);

	// Mouse event feed: when `mouse` is enabled, listen with xterm-mouse and
	// push events into the engine's mouse region hit-testing.
	useEffect(() => {
		if (!mouse) return;
		if (!Mouse.isSupported()) {
			console.warn(
				"[ink-cartridge] Mouse tracking requires a TTY input stream — mouse events disabled."
			);
			return;
		}
		const mouseInstance = new Mouse(mouseOptions);
		try {
			mouseInstance.enable();
		} catch (err) {
			console.warn(
				"[ink-cartridge] Failed to enable mouse tracking:",
				err instanceof Error ? err.message : err
			);
			return;
		}
		const handle = (event: XtermMouseEvent): void => {
			engine.processMouseEvent(event);
		};
		mouseInstance.on("click", handle);
		mouseInstance.on("wheel", handle);
		mouseInstance.on("move", handle);
		mouseInstance.on("press", handle);
		mouseInstance.on("drag", handle);
		mouseInstance.on("release", handle);
		return () => {
			mouseInstance.off("click", handle);
			mouseInstance.off("wheel", handle);
			mouseInstance.off("move", handle);
			mouseInstance.off("press", handle);
			mouseInstance.off("drag", handle);
			mouseInstance.off("release", handle);
			mouseInstance.destroy();
		};
	}, [mouse, engine, mouseOptions]);

	const value: KeyboardContextValue = useMemo(
		() => ({
			boundKeyboard: engine.boundKeyboard.bind(engine) as any,
			penetration: engine.penetration.bind(engine),
			stop: engine.stop.bind(engine),
			globalKeys: engine.globalKeys.bind(engine),
			getGlobalKeys: engine.getGlobalKeys.bind(engine),
			globalSequence: engine.globalSequence.bind(engine),
			getGlobalSequences: engine.getGlobalSequences.bind(engine),
			getGlobalPendingSequence: engine.getGlobalPendingSequence.bind(engine),
			thereGlobalQueueWaiting: engine.thereGlobalQueueWaiting.bind(engine),
			currentScreenHasSequenceWaiting:
				engine.currentScreenHasSequenceWaiting.bind(engine),
			focusSet: engine.focusSet.bind(engine),
			focusNext: engine.focusNext.bind(engine),
			focusPrev: engine.focusPrev.bind(engine),
			focusCurrent: engine.focusCurrent.bind(engine),
			focusUnregister: engine.focusUnregister.bind(engine),
			subscribeFocus: engine.subscribeFocus.bind(engine),
			defineShortcutAction: engine.defineShortcutAction.bind(engine),
			addAction: engine.addAction.bind(engine),
			hasAction: engine.hasAction.bind(engine),
			removeAction: engine.removeAction.bind(engine),
			modifyAction: engine.modifyAction.bind(engine),
			clearShortcutOperations: engine.clearShortcutOperations.bind(engine),
			defineSequenceAction: engine.defineSequenceAction.bind(engine),
			addSequenceAction: engine.addSequenceAction.bind(engine),
			hasSequenceAction: engine.hasSequenceAction.bind(engine),
			removeSequenceAction: engine.removeSequenceAction.bind(engine),
			modifySequenceAction: engine.modifySequenceAction.bind(engine),
			clearSequenceOperations: engine.clearSequenceOperations.bind(engine),
			_pushOwner: engine.pushOwner.bind(engine),
			_popOwner: engine.popOwner.bind(engine),
			boundSequence: engine.boundSequence.bind(engine) as any,
			enableWildcardPriority: engine.enableWildcardPriority.bind(engine),
			useModalMissListener: engine.useModalMissListener.bind(engine),
			allowModal: engine.allowModal.bind(engine),
			// readLayer is overloaded (component vs layer-id); narrow so the
			// matching overload is picked.
			readLayer: (owner) =>
				typeof owner === "string"
					? engine.readLayer(owner)
					: engine.readLayer(owner),
			getCurrentMode: engine.getCurrentMode.bind(engine),
			addMode: engine.addMode.bind(engine),
			removeMode: engine.removeMode.bind(engine),
			setMode: engine.setMode.bind(engine),
			nextMode: engine.nextMode.bind(engine),
			prevMode: engine.prevMode.bind(engine),
			addCondition: engine.addCondition.bind(engine),
			setCondition: engine.setCondition.bind(engine),
			removeCondition: engine.removeCondition.bind(engine),
			addProcessor: engine.addProcessor.bind(engine),
			removeProcessor: engine.removeProcessor.bind(engine),
			getProcessors: engine.getProcessors.bind(engine),
			resetProcessors: engine.resetProcessors.bind(engine),
			registryCompositionKey: engine.registryCompositionKey.bind(engine),
			removeCompositionKey: engine.removeCompositionKey.bind(engine),
			clearAllCompositionKeys: engine.clearAllCompositionKeys.bind(engine),
			hasPendingComposition: engine.hasPendingComposition.bind(engine),
			getCompositionContext: engine.getCompositionContext.bind(engine),
			abortComposition: engine.abortComposition.bind(engine),
			updateCompositionKey: engine.updateCompositionKey.bind(engine),
			setValueSchema: engine.setValueSchema.bind(engine),
			undoComposition: engine.undoComposition.bind(engine),
			bufferedCompositionCount: engine.bufferedCompositionCount.bind(engine),
			clearCompositionBuffers: engine.clearCompositionBuffers.bind(engine),
			subscribeComposition: engine.subscribeComposition.bind(engine),
			getLastCompositionEvent: engine.getLastCompositionEvent.bind(engine),
			addMapping: engine.addMapping.bind(engine),
			removeMappingKey: engine.removeMappingKey.bind(engine),
			removeMapping: engine.removeMapping.bind(engine),
			subscribeMapping: engine.subscribeMapping.bind(engine),
			getLastMappingEvent: engine.getLastMappingEvent.bind(engine),
			activateFocusGroup: engine.activateFocusGroup.bind(engine),
			kickFocusGroup: engine.kickFocusGroup.bind(engine),
			kickProcessor: engine.kickProcessor.bind(engine),
			activeProcessor: engine.activeProcessor.bind(engine),
			setProcessorWeight: engine.setProcessorWeight.bind(engine),
			registerMouseRegion: engine.registerMouseRegion.bind(engine),
			unregisterMouseRegion: engine.unregisterMouseRegion.bind(engine),
			getHoveredMouseRegion: engine.getHoveredMouseRegion.bind(engine),
		}),
		[engine]
	);

	// When mouse tracking is on, Ink still receives the same raw bytes as the
	// mouse parser. Mouse reports must never reach the keyboard pipeline —
	// otherwise SGR sequences get typed into the app as garbage text.
	const mouseReportFilterRef = useRef<MouseReportFilter | null>(null);
	if (mouse && !mouseReportFilterRef.current) {
		mouseReportFilterRef.current = new MouseReportFilter();
	}

	useInput((input, key) => {
		if (mouseReportFilterRef.current?.consume(input)) {
			return;
		}
		engine.processKey(input, key);
	});

	return (
		<KeyboardContext.Provider value={value}>
			{children}
		</KeyboardContext.Provider>
	);
}

export { clearShortcutOperations };
