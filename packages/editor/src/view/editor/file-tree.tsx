import { useI18n } from "@cartridge-engine/i18n";
import { Box, Text, useWindowSize } from "ink";
import {
	applyElementToModalLayer,
	getEngine,
	LayerElementContext,
	ModalLayerElementContext,
	openModalLayer,
	subscribeFocus,
	useKeyboard,
	useMouseRegion,
	useScreenSystem,
} from "ink-cartridge";
import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { basename } from "node:path";
import stringWidth from "string-width";
import type { FileNode, FileTreeState } from "../../core/io/file-tree-model.js";
import {
	clearFileTreeCache,
	flattenTree,
	resolveFileTreeRoot,
	scanDirectoryCached,
	toggleExpanded,
} from "../../core/io/file-tree-model.js";
import type { EditorSession } from "../../core/io/session.js";
import { useSettings } from "../../core/settings/useSettings.js";
import { ModalFrame } from "../utils/modal-frame.js";
import { elementHasFocus } from "../../utils/view/element-focus.js";
import { setTreePos } from "../event/subscription/tree-store.js";
import {
	getTreeFocusRequested,
	setTreeFocusRequested,
	subscribeTreeFocus,
} from "../event/subscription/tree-focus-store.js";

/** Narrowest the pane can be; wide enough for short names. */
const MIN_TREE_WIDTH = 24;
/**
 * Focus-target id for the pane's keyboard bindings. Deliberately separate from
 * the layer element id (also "file-tree") so the focus state and the gated
 * bindings stay coupled to one name if either is ever renamed.
 */
const FOCUS_ID = "file-tree";
/** Widest the pane can be — the editor keeps at least 20 columns. */
const MAX_TREE_WIDTH = 60;

/**
 * Scroll offset that keeps `cursor` inside the `[top, top + viewport)` window,
 * moving as little as possible: up if the cursor is above, down if below.
 * `viewport` must be ≥ 1.
 */
function revealScrollTop(cursor: number, top: number, viewport: number): number {
	if (cursor < top) return cursor;
	if (cursor >= top + viewport) return cursor - viewport + 1;
	return top;
}

export type FileTreeProps = {
	/** The shared file session; clicking a file opens it here. */
	session: EditorSession;
};

/**
 * VSCode-style file tree pinned to the right edge of the terminal (regular
 * layer element). Recursively scans the configured root directory once per
 * settings change; directories expand/collapse on click, files open in the
 * editor (with an unsaved-changes prompt when the buffer is dirty). Scrolling
 * is mouse-wheel or keyboard-cursor driven; the pane is fixed — not
 * draggable — and stays below the information bar.
 *
 * While the pane holds keyboard focus (toggled by `Tab` in normal mode on the
 * editor page), the cursor keys / `j` `k` move a selection, `Enter` opens a
 * file or expands a directory, `h` `l` collapse/expand, and `Esc` returns
 * focus to the editor.
 */
export function FileTree({ session }: FileTreeProps) {
	const { rows, columns } = useWindowSize();
	const { settings } = useSettings();
	const { t } = useI18n();
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [scrollTop, setScrollTop] = useState(0);
	const [hoveredPath, setHoveredPath] = useState<string | null>(null);
	// Keyboard selection: index into `visibleRows`. Mirrored in a ref so the
	// (mount-only) key bindings below read the latest value without ever
	// re-registering — re-registering a focus-gated binding while the pane is
	// unfocused would re-trigger the engine's first-target auto-activation and
	// steal focus back from the editor.
	const [cursorIndex, setCursorIndex] = useState(0);
	const cursorRef = useRef(0);
	const { boundKeyboard, focusSet, kickFocusGroup } = useKeyboard();
	// This pane's layer + element ids, used to query the engine's focus state
	// directly. `useFocusState` is avoided here: it resolves through the
	// engine's owner stack, which is ambiguous while a sibling layer element
	// (the toolbar) is mounted, so the highlight would flicker. Reading the
	// layer by id is exact.
	const layerCtx = useContext(LayerElementContext);
	const layerId = layerCtx?.layer.layerId;
	const elementId = layerCtx?.id;
	/** Whether the engine currently has this pane's focus target active. */
	const thereIsFocus = useCallback(() => {
		if (!layerId || !elementId) return false;
		return elementHasFocus(getEngine().readLayer(layerId, elementId), FOCUS_ID);
	}, [layerId, elementId]);
	// True only while the editor page has handed this pane the keyboard.
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		const read = () => setFocused(thereIsFocus());
		read();
		return subscribeFocus(read);
	}, [thereIsFocus]);

	// scanTick bumps to force a re-scan — the cache never expires on its own.
	const [scanTick, setScanTick] = useState(0);

	const [root, setRoot] = useState<FileTreeState>({
		scanning: true,
	});
	const [prevRoot, setPrevRoot] = useState(root);

	useEffect(() => {
		setRoot({ scanning: true });
		(async () => {
			const resolved = resolveFileTreeRoot(settings.fileTree, process.cwd());
			setRoot(await scanDirectoryCached(resolved));
		})();
	}, [settings.fileTree, scanTick]);

	// A new scan (root changed) starts collapsed at the top — reset during
	// render so the next frame already renders with the reset state.
	if (prevRoot !== root) {
		setPrevRoot(root);
		setExpanded(new Set());
		setScrollTop(0);
		cursorRef.current = 0;
		setCursorIndex(0);
	}

	const visibleRows = useMemo(
		() => ('node' in root ? flattenTree(root.node, expanded) : []),
		[root, expanded]
	);

	const handleWheel = useCallback((event: { button: string }) => {
		if (event.button === "wheel-up") {
			setScrollTop((t) => Math.max(0, t - 1));
		} else if (event.button === "wheel-down") {
			setScrollTop((t) => t + 1);
		}
	}, []);

	const openFile = useCallback(
		(path: string) => {
			if (session.isDirty()) {
				openUnsavedPrompt(session, path, t("fileTree.unsaved"));
			} else {
				session.open(path);
			}
		},
		[session, t]
	);

	const toggleDir = useCallback((path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			toggleExpanded(next, path);
			return next;
		});
	}, []);

	const containerRef = useMouseRegion({ onWheel: handleWheel });
	// Manual refresh: the scan cache never expires on its own, so new files
	// only appear after a click here (cache cleared + re-scan).
	const [refreshHovered, setRefreshHovered] = useState(false);
	const refreshRef = useMouseRegion({
		onEnter: () => setRefreshHovered(true),
		onLeave: () => setRefreshHovered(false),
		onClick: () => {
			clearFileTreeCache();
			setScanTick((t) => t + 1);
		},
	});
	const viewportRows = Math.max(1, rows - 4);
	const visible = visibleRows.slice(scrollTop, scrollTop + viewportRows);

	// Latest values read by the stable bindings, refreshed every render.
	const navRef = useRef({ rows: visibleRows, viewport: viewportRows, expanded });
	useEffect(() => {
		navRef.current = { rows: visibleRows, viewport: viewportRows, expanded };
	});

	const moveCursor = useCallback((delta: number) => {
		const { rows, viewport } = navRef.current;
		const max = Math.max(0, rows.length - 1);
		const next = Math.min(Math.max(0, cursorRef.current + delta), max);
		cursorRef.current = next;
		setCursorIndex(next);
		// Keep the cursor inside the viewport (keyboard replaces wheel-only scrolling).
		setScrollTop((top) => revealScrollTop(next, top, viewport));
	}, []);

	const activateRow = useCallback(() => {
		const row = navRef.current.rows[cursorRef.current];
		if (!row) return;
		if (row.node.isDir) {
			toggleDir(row.node.path);
		} else {
			openFile(row.node.path);
		}
	}, [openFile, toggleDir]);

	// Left collapses an expanded directory; right expands a collapsed one.
	// Both are no-ops on files (and on wrong-state directories).
	const setRowExpanded = useCallback(
		(open: boolean) => {
			const row = navRef.current.rows[cursorRef.current];
			if (!row || !row.node.isDir) return;
			const isExpanded = navRef.current.expanded.has(row.node.path);
			if (isExpanded !== open) {
				toggleDir(row.node.path);
			}
		},
		[toggleDir]
	);

	// Latest handlers + boundKeyboard captured in refs so the mount-only
	// binding effect below never re-runs. `boundKeyboard`'s identity changes
	// across renders, and re-registering a focus-gated binding while the pane
	// is unfocused re-triggers the engine's first-target auto-activation —
	// which would steal focus from the editor. Registering exactly once (and
	// refreshing the refs each render) sidesteps that entirely.
	const handlersRef = useRef({
		move: moveCursor,
		activate: activateRow,
		expand: setRowExpanded,
		exit: () => setTreeFocusRequested(false),
	});
	const bindRef = useRef(boundKeyboard);
	useEffect(() => {
		handlersRef.current = {
			move: moveCursor,
			activate: activateRow,
			expand: setRowExpanded,
			exit: () => setTreeFocusRequested(false),
		};
		bindRef.current = boundKeyboard;
	});

	// The pane's navigation keys live under the "file-tree" focus target and
	// the normal mode, so they only fire while the editor page has handed over
	// focus AND the editor is in normal mode. The mode gate matters: `i`
	// reaches the editor (which switches to insert) even while the pane holds
	// focus, and without it the pane would then swallow `j`/`k`/`h`/`l` and
	// `Enter` as the user types.
	useEffect(() => {
		const bind = bindRef.current;
		const h = handlersRef;
		const opts = { focusId: FOCUS_ID, mode: "normal" };
		const unbinds = [
			bind(["up", "k"], () => h.current.move(-1), opts),
			bind(["down", "j"], () => h.current.move(1), opts),
			bind(["return"], () => h.current.activate(), opts),
			bind(["left", "h"], () => h.current.expand(false), opts),
			bind(["right", "l"], () => h.current.expand(true), opts),
			bind(["escape"], () => h.current.exit(), opts),
		];
		return () => unbinds.forEach((unbind) => unbind());
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only on purpose (see above)
	}, []);

	// Reconcile the engine's focus to the editor's intent. The engine
	// auto-activates the first focus target on a layer (this pane is its
	// layer's only element), so a bare mount would grab the keyboard. And
	// because the `useKeyboard` handles (`focusSet`/`kickFocusGroup`) are not
	// referentially stable, this effect re-runs on re-renders — reconciling
	// (an idempotent no-op unless intent and engine disagree) keeps focus
	// correct no matter how often the handles churn.
	useEffect(() => {
		const reconcile = () => {
			const want = getTreeFocusRequested();
			const has = thereIsFocus();
			if (want && !has) {
				focusSet(FOCUS_ID);
			} else if (!want && has) {
				kickFocusGroup();
			}
		};
		reconcile();
		return subscribeTreeFocus(reconcile);
	}, [focusSet, kickFocusGroup, thereIsFocus]);

	// Keep the cursor and the scroll offset valid when the visible rows or the
	// viewport change (collapse, rescan, terminal resize). The scroll bound is
	// the last viewport offset (`length - viewportRows`), not the last row index
	// — clamping to the index would leave the slice past the end and render
	// blank rows. And a shrinking viewport can leave the cursor below the
	// window, so `revealScrollTop` re-derives the offset for it too.
	useEffect(() => {
		const maxCursor = Math.max(0, visibleRows.length - 1);
		if (cursorRef.current > maxCursor) {
			cursorRef.current = maxCursor;
			setCursorIndex(maxCursor);
		}
		const viewport = navRef.current.viewport;
		const maxScroll = Math.max(0, visibleRows.length - viewport);
		setScrollTop((top) =>
			Math.min(
				maxScroll,
				Math.max(0, revealScrollTop(cursorRef.current, Math.min(top, maxScroll), viewport))
			)
		);
	}, [visibleRows.length, viewportRows]);

	// Fit the pane to its widest visible line (indent + arrow + name), so
	// long file names stay readable; capped so the editor keeps room.
	const treeWidth = useMemo(() => {
		const widest = visible.reduce(
			(max, row) =>
				Math.max(max, (row.depth - 1) * 2 + 2 + stringWidth(row.node.name)),
			0
		);
		const title = "node" in root ? stringWidth(basename(root.path)) : 0;
		// +3 = row padding (1) + the two border cells.
		const content = Math.max(widest, title) + 3;
		return Math.min(Math.max(MIN_TREE_WIDTH, content), MAX_TREE_WIDTH);
	}, [root, visible]);

	// Publish the live width so the toolbar's drag clamp stays in sync
	// (module store — the tree and toolbar are separate layer elements).
	useEffect(() => {
		setTreePos({
			y: 1,
			x: columns - treeWidth,
			width: treeWidth,
			height: rows - 1,
		});
	}, [treeWidth, columns, rows]);

	return (
		<Box
			ref={containerRef}
			position="absolute"
			top={1}
			left={columns - treeWidth}
			width={treeWidth}
			height={rows - 1}
			borderStyle="bold"
			borderColor={focused ? "blue" : "white"}
			// Match the editor surface so the pane reads as part of it.
			backgroundColor="#1e1e1e"
			borderBackgroundColor="#1e1e1e"
			flexDirection="column"
		>
			<Box paddingLeft={1} paddingTop={1} flexDirection="row">
				<Text bold>{"node" in root ? basename(root.path) : "-"}</Text>
				<Box ref={refreshRef} marginLeft={1}>
					<Text color={refreshHovered ? "green" : "gray"}>↻</Text>
				</Box>
			</Box>
			{"scanning" in root ? (
				<Box paddingLeft={1}>
					<Text dimColor>{t("fileTree.scanning")}</Text>
				</Box>
			) : "fail" in root ? (
				<Box paddingLeft={1}>
					<Text dimColor>{t("fileTree.fail")}</Text>
				</Box>
			) : (
				visible.map((row, i) => (
					<TreeRow
						key={row.node.path}
						node={row.node}
						depth={row.depth}
						expanded={expanded.has(row.node.path)}
						hovered={hoveredPath === row.node.path}
						active={focused && scrollTop + i === cursorIndex}
						onEnter={() => setHoveredPath(row.node.path)}
						onLeave={() =>
							setHoveredPath((h) => (h === row.node.path ? null : h))
						}
						onWheel={handleWheel}
						onClick={() => {
							if (row.node.isDir) {
								toggleDir(row.node.path);
							} else {
								openFile(row.node.path);
							}
						}}
					/>
				))
			)}
		</Box>
	);
}

type TreeRowProps = {
	node: FileNode;
	depth: number;
	/** Whether this directory is expanded (drives the arrow direction). */
	expanded: boolean;
	hovered: boolean;
	/** Whether this row holds the keyboard cursor while the pane is focused. */
	active: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onWheel: (event: { button: string }) => void;
	onClick: () => void;
};

/**
 * One tree line: indent + expand arrow (dirs) + name. The arrow follows the
 * expansion state: collapsed dirs point right, expanded ones point down
 * (VSCode convention); empty dirs show no arrow. Wheel events are forwarded
 * so scrolling works while the cursor is over a row — the engine delivers
 * wheel to the top hit region only.
 */
function TreeRow({
	node,
	depth,
	expanded,
	hovered,
	active,
	onEnter,
	onLeave,
	onWheel,
	onClick,
}: TreeRowProps) {
	const ref = useMouseRegion(
		{ onEnter, onLeave, onClick, onWheel },
		{ priority: 1 }
	);
	const hasChildren = (node.children?.length ?? 0) > 0;
	const arrow = node.isDir
		? hasChildren
			? expanded
				? "▾ "
				: "▸ "
			: "  "
		: "  ";
	// The root is not rendered, so depth starts at 1; each level adds one indent.
	const indent = "  ".repeat(Math.max(0, depth - 1));
	return (
		<Box ref={ref} paddingLeft={1}>
			<Text inverse={hovered || active} bold={node.isDir}>
				{indent}
				{arrow}
				{node.name}
			</Text>
		</Box>
	);
}

type PromptButtonProps = {
	label: string;
	hotkey: string;
	active: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onClick: () => void;
};

/** One button of the unsaved-changes prompt (mouse + keyboard hotkey). */
function PromptButton({
	label,
	hotkey,
	active,
	onEnter,
	onLeave,
	onClick,
}: PromptButtonProps) {
	const ref = useMouseRegion({ onEnter, onLeave, onClick }, { priority: 1 });
	return (
		<Box ref={ref} paddingLeft={1} paddingRight={1}>
			<Text inverse={active}>
				{label} ({hotkey})
			</Text>
		</Box>
	);
}

type UnsavedPromptProps = {
	title: string;
	onSave: () => void;
	onDiscard: () => void;
	onCancel: () => void;
};

/**
 * Modal "unsaved changes" prompt with three choices (Save / Discard /
 * Cancel), opened when a file-tree click would discard a dirty buffer.
 * Keyboard: s / d / c (Esc also cancels); the buttons are mouse-clickable.
 */
function UnsavedPrompt({
	title,
	onSave,
	onDiscard,
	onCancel,
}: UnsavedPromptProps) {
	const ctx = useContext(ModalLayerElementContext);
	const { t } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const { closeModalLayer } = useScreenSystem();
	const [hovered, setHovered] = useState<"save" | "discard" | "cancel" | null>(
		null
	);

	const close = useCallback(() => {
		if (ctx) {
			closeModalLayer(ctx.modalLayer.layerId);
		}
	}, [closeModalLayer, ctx]);

	useEffect(() => {
		if (!ctx) {
			return;
		}
		const unbinds = [
			boundKeyboard(
				["s"],
				() => {
					close();
					onSave();
				},
				{ elementId: ctx.id }
			),
			boundKeyboard(
				["d"],
				() => {
					close();
					onDiscard();
				},
				{ elementId: ctx.id }
			),
			boundKeyboard(
				["c", "escape"],
				() => {
					close();
					onCancel();
				},
				{ elementId: ctx.id }
			),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [boundKeyboard, close, ctx, onCancel, onDiscard, onSave]);

	return (
		<ModalFrame title={title}>
			<Box flexDirection="row" gap={2}>
				<PromptButton
					label={t("confirm.save")}
					hotkey="s"
					active={hovered === "save"}
					onEnter={() => setHovered("save")}
					onLeave={() => setHovered((h) => (h === "save" ? null : h))}
					onClick={() => {
						close();
						onSave();
					}}
				/>
				<PromptButton
					label={t("confirm.discard")}
					hotkey="d"
					active={hovered === "discard"}
					onEnter={() => setHovered("discard")}
					onLeave={() => setHovered((h) => (h === "discard" ? null : h))}
					onClick={() => {
						close();
						onDiscard();
					}}
				/>
				<PromptButton
					label={t("confirm.cancel")}
					hotkey="c"
					active={hovered === "cancel"}
					onEnter={() => setHovered("cancel")}
					onLeave={() => setHovered((h) => (h === "cancel" ? null : h))}
					onClick={() => {
						close();
						onCancel();
					}}
				/>
			</Box>
		</ModalFrame>
	);
}

/**
 * Open the unsaved-changes prompt; on Save the buffer is written first and
 * only then is the target file loaded (a failed save keeps the editor put).
 */
function openUnsavedPrompt(
	session: EditorSession,
	targetPath: string,
	title: string,
): void {
	openModalLayer("unsaved", 100);
	applyElementToModalLayer("unsaved", {
		elementId: "unsaved-prompt",
		element: UnsavedPrompt,
		props: {
			title,
			onSave: () => {
				const saved = session.save();
				if (saved.ok) {
					session.open(targetPath);
				}
			},
			onDiscard: () => session.open(targetPath),
			onCancel: () => {},
		},
	});
}
