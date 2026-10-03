import { useI18n } from "@cartridge-engine/i18n";
import { Box, Text, useBoxMetrics, useCursor } from "ink";
import {
	applyElement,
	applyElementToModalLayer,
	closeLayer,
	eraseElement,
	openLayer,
	openModalLayer,
	useKeyboard,
	useMouseRegion,
} from "ink-cartridge";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { EditorSession } from "../../core/io/session.js";
import { useSettings } from "../../core/settings/useSettings.js";
import { clickToPosition } from "../../utils/view/click-mapping.js";
import { CommandBar } from "../editor/command-bar.js";
import { EditorSetting } from "../editor/editor-setting.js";
import { FileTree } from "../editor/file-tree.js";
import { ToolBar } from "../editor/tool-bar.js";
import { InformationBar } from "../editor/information-bar.js";
import {
	getTreeFocusRequested,
	setTreeFocusRequested,
} from "../event/subscription/tree-focus-store.js";

/** Layer hosting the floating toolbar; below modal layers so it never
 *  intercepts keys meant for a modal (e.g. the command bar). */
const TOOLBAR_LAYER_ID = "toolbar";
const TOOLBAR_Z_INDEX = 1;
/** Layer hosting the file tree; a regular layer like the toolbar. */
const FILETREE_LAYER_ID = "file-tree";
const FILETREE_Z_INDEX = 1;
/** Layer hosting the in-editor settings overlay (above the other panes). */
const EDITOR_SETTINGS_LAYER_ID = "editor-settings";
const EDITOR_SETTINGS_Z_INDEX = 2;

export type EditorContext = {
	onChance?: () => void;
	value?: string;
	lineNumberRightSpacing?: number;
	cursorOffset?: number;
	cursorHeightOffset?: number;
	numberOfIndentationSpaces?: number;
};

/**
 * Main editor view: renders the status bar + line numbers + text, routes
 * every keystroke to the controller as a named command, and splits
 * bindings by mode — insert keeps the classic editing keys, normal gets
 * hjkl + arrow-key movement and the `:` command bar.
 */
export function Editor({
	value: initialText = "",
	lineNumberRightSpacing = 1,
	cursorOffset = 0,
	cursorHeightOffset = 2,
	numberOfIndentationSpaces = 2,
}: EditorContext) {
	// One file session per editor mount; `Document.setText` keeps the
	// controller instance stable across file opens, so bindings stay live.
	const sessionRef = useRef<EditorSession | null>(null);
	if (!sessionRef.current) {
		sessionRef.current = new EditorSession(initialText, {
			indentWidth: numberOfIndentationSpaces,
		});
	}
	const session = sessionRef.current;
	const controller = session.controller;

	const [, forceUpdate] = useState(0);
	useEffect(() => {
		const unbindDoc = controller.onChange(() => forceUpdate((n) => n + 1));
		// File opens/saves notify the session, not the controller.
		const unbindSession = session.onChange(() => forceUpdate((n) => n + 1));
		return () => {
			unbindDoc();
			unbindSession();
		};
	}, [controller, session]);

	const { setCursorPosition } = useCursor();
	const {
		boundKeyboard,
		enableWildcardPriority,
		getCurrentMode,
		registryCompositionKey,
		removeCompositionKey,
		setMode,
	} = useKeyboard();
	const { t } = useI18n();
	const { settings } = useSettings();

	// The engine keeps modes in a ref (no React notification), so we mirror
	// switches locally to keep the status bar live.
	const [mode, setLocalMode] = useState<string | null>(() => getCurrentMode());
	const switchMode = useCallback(
		(next: string | null) => {
			setMode(next);
			setLocalMode(next);
		},
		[setMode],
	);

	const openCommandBar = useCallback(() => {
		openModalLayer("command", 100);
		applyElementToModalLayer("command", {
			elementId: "command-input",
			element: CommandBar,
			props: { session },
		});
	}, [session]);

	// The toolbar lives in a regular layer (below modal layers) so it floats
	// above the document without taking over the keyboard. The editor owns the
	// layer lifecycle and the ctrl+tab toggle because the layer's element
	// unmounts when it closes — a binding inside it could never re-open it.
	const [toolbarOpen, setToolbarOpen] = useState(true);
	useEffect(() => {
		return () => closeLayer(TOOLBAR_LAYER_ID);
	}, []);
	// Opening must wait one tick: passive effects run child-first on mount, so
	// when the editor IS the initial screen this effect races the provider's
	// dispatcher registration and openLayer would throw. ctrl+tab toggles hit
	// the same deferred path — the one-tick delay is imperceptible. Closing is
	// safe immediately because the dispatcher is registered by then.
	// The file tree pane (right side) toggles via the toolbar's File Tree
	// button; it defaults to open so the editor greets the user with a tree.
	const [fileTreeOpen, setFileTreeOpen] = useState(true);
	// The in-editor settings overlay toggles via the toolbar's Settings
	// button; the overlay itself closes via its Exit button or Esc.
	const [settingsOpen, setSettingsOpen] = useState(false);
	// Whether the file tree pane holds the keyboard (toggled by Tab in normal
	// mode) lives in a module store: the editor only records the intent, and
	// the tree reconciles the engine's focus to it. This survives the tree
	// remounting on terminal resize (a one-shot engine call would not).

	useEffect(() => {
		if (!toolbarOpen) {
			closeLayer(TOOLBAR_LAYER_ID);
			return;
		}
		const timer = setTimeout(() => {
			openLayer(TOOLBAR_LAYER_ID, TOOLBAR_Z_INDEX);
			// applyElement ignores re-applies of an existing element id, so
			// erase first — otherwise prop updates (mode, fileTreeOpen) would
			// never reach the mounted toolbar. The toolbar's drag position
			// survives the remount via the external position store.
			eraseElement(TOOLBAR_LAYER_ID, "toolbar");
			applyElement(TOOLBAR_LAYER_ID, {
				elementId: "toolbar",
				element: ToolBar,
				props: {
					currentMode: mode,
					session,
					openFileTree: () => {
						setFileTreeOpen((open) => !open);
						// Hiding the pane forfeits its focus (its layer unmounts).
						setTreeFocusRequested(false);
					},
					openSettings: () => setSettingsOpen((open) => !open),
					fileTreeOpen,
				},
			});
		}, 0);
		return () => clearTimeout(timer);
	}, [toolbarOpen, mode, session, fileTreeOpen, settingsOpen]);
	useEffect(() => {
		if (!fileTreeOpen) {
			closeLayer(FILETREE_LAYER_ID);
			return;
		}
		const timer = setTimeout(() => {
			openLayer(FILETREE_LAYER_ID, FILETREE_Z_INDEX);
			applyElement(FILETREE_LAYER_ID, {
				elementId: "file-tree",
				element: FileTree,
				props: { session },
			});
		}, 0);
		return () => clearTimeout(timer);
	}, [fileTreeOpen, session]);
	// Tab hands the keyboard between the editor and the tree, but only while
	// the tree is open and only in normal mode (insert keeps Tab = indent).
	// The tree binds no Tab, so the event bubbles here from the layer stage.
	// Only the intent is recorded here; the tree reconciles the engine to it.
	useEffect(() => {
		if (!fileTreeOpen) return;
		return boundKeyboard(
			["tab"],
			() => setTreeFocusRequested(!getTreeFocusRequested()),
			{ mode: "normal" }
		);
	}, [boundKeyboard, fileTreeOpen]);
	// Leaving the editor clears the intent; the store is a module singleton and
	// must not leak into a later mount (e.g. re-entering from the main menu).
	useEffect(() => {
		return () => setTreeFocusRequested(false);
	}, []);
	// Both branches are deferred: settingsOpen starts false, and an immediate
	// closeLayer on the first mount would race the provider's dispatcher
	// registration (same child-first effect ordering as the toolbar open).
	useEffect(() => {
		const timer = setTimeout(() => {
			if (!settingsOpen) {
				closeLayer(EDITOR_SETTINGS_LAYER_ID);
				return;
			}
			openLayer(EDITOR_SETTINGS_LAYER_ID, EDITOR_SETTINGS_Z_INDEX);
			applyElement(EDITOR_SETTINGS_LAYER_ID, {
				elementId: "editor-settings",
				element: EditorSetting,
			});
		}, 0);
		return () => clearTimeout(timer);
	}, [settingsOpen]);
	useEffect(() => {
		return () => closeLayer(EDITOR_SETTINGS_LAYER_ID);
	}, []);
	useEffect(() => {
		return () => closeLayer(FILETREE_LAYER_ID);
	}, []);
	useEffect(() => {
		return boundKeyboard(["ctrl+tab"], () => setToolbarOpen((open) => !open));
	}, [boundKeyboard]);

	// Keep the coalescing window in step with the persisted setting; edits
	// closer together than it share one undo step (0 disables merging).
	useEffect(() => {
		controller.history.setMergeWindow(settings.history.mergeWindow);
	}, [controller, settings.history.mergeWindow]);

	useEffect(() => {
		const removeWildcard = enableWildcardPriority();
		const unbinds: (() => void)[] = [];
		const bind = (
			keys: string[],
			handler: (input: string) => void,
			options: { mode?: string } = {},
		) => {
			unbinds.push(boundKeyboard(keys, handler, options));
		};

		// insert mode: classic editing
		bind(["*"], (input) => controller.execute("editor.insertText", { text: input }), {
			mode: "insert",
		});
		bind(["return"], () => controller.execute("editor.splitLine"), { mode: "insert" });
		bind(["right"], () => controller.execute("cursor.moveRight"), { mode: "insert" });
		bind(["left"], () => controller.execute("cursor.moveLeft"), { mode: "insert" });
		// backspace deletes before the cursor; delete removes after it.
		bind(["backspace"], () => controller.execute("editor.deleteBefore"), {
			mode: "insert",
		});
		bind(["delete"], () => controller.execute("editor.deleteAfter"), { mode: "insert" });
		bind(["up"], () => controller.execute("cursor.moveUp"), { mode: "insert" });
		bind(["down"], () => controller.execute("cursor.moveDown"), { mode: "insert" });
		bind(["tab"], () => controller.execute("editor.indent"), { mode: "insert" });
		bind(["shift+tab"], () => controller.execute("editor.outdent"), { mode: "insert" });
		bind(["escape"], () => switchMode("normal"), { mode: "insert" });

		// normal mode: movement + command bar
		bind(["h", "left"], () => controller.execute("cursor.moveLeft"), { mode: "normal" });
		bind(["j"], () => controller.execute("cursor.moveDown"), { mode: "normal" });
		bind(["down"], () => controller.execute("cursor.moveDown"), { mode: "normal" });
		bind(["k", "up"], () => controller.execute("cursor.moveUp"), { mode: "normal" });
		bind(["l", "right"], () => controller.execute("cursor.moveRight"), { mode: "normal" });
		bind(["w"], () => controller.execute("cursor.wordForward"), { mode: "normal" });
		bind(["b"], () => controller.execute("cursor.wordBackward"), { mode: "normal" });
		bind(["0"], () => controller.execute("cursor.lineStart"), { mode: "normal" });
		bind(["$"], () => controller.execute("cursor.lineEnd"), { mode: "normal" });
		// `gg` via the composition engine: the first `g` arms the chain, the
		// second fires documentStart. `mode` keeps typing `g` in insert mode
		// untouched, since composition runs ahead of the `*` wildcard.
		registryCompositionKey({
			key: "g",
			flags: [],
			alternativeFlag: "goto",
			needs: ["goto"],
			optional: true,
			mode: "normal",
			execute: (ctx) => {
				if (ctx.lastFlag === "goto") {
					controller.execute("cursor.documentStart");
					return null;
				}
				// head press: let the engine fill the flag from alternativeFlag
				return { ...ctx, lastFlag: null };
			},
		});

		// Vim-style count prefix: digits accumulate in the chain's `value`, then a
		// direction key spends it (`5j`, `12k`). Composition runs ahead of the
		// screen bindings, so a bare digit arms a chain instead of moving.
		const countKeys: string[] = [];
		for (const digit of "1234567890") {
			countKeys.push(digit);
			registryCompositionKey({
				key: digit,
				flags: [],
				alternativeFlag: "number",
				needs: ["number"],
				// `0` cannot open a count, so a bare `0` keeps meaning line-start
				// via its binding below; it may still extend one (`10j`).
				optional: digit !== "0",
				mode: "normal",
				execute: (ctx) => ({
					...ctx,
					value: (typeof ctx.value === "number" ? ctx.value : 0) * 10 + Number(digit),
					lastFlag: "number",
				}),
			});
		}

		// Counts only pay off on the vertical keys; h/l/left/right stay untouched.
		const directions: [string, string][] = [
			["k", "cursor.moveUp"],
			["up", "cursor.moveUp"],
			["j", "cursor.moveDown"],
			["down", "cursor.moveDown"],
		];
		for (const [key, command] of directions) {
			countKeys.push(key);
			registryCompositionKey({
				key,
				flags: [],
				alternativeFlag: "direction",
				needs: ["number"],
				mode: "normal",
				// The count is spent here and the chain ends, so swallow the key —
				// otherwise the plain binding below would move one extra line.
				KeyReleaseWhenChainInterrupted: true,
				execute: (ctx) => {
					controller.execute(command, { count: ctx.value });
					return null;
				},
			});
		}

		unbinds.push(() => removeCompositionKey("g"));
		unbinds.push(() => countKeys.forEach((key) => removeCompositionKey(key)));
		// Ink marks "G" as shift+g, so the normalized key name is "shift+G".
		bind(["shift+G"], () => controller.execute("cursor.documentEnd"), { mode: "normal" });
		bind(["i"], () => switchMode("insert"), { mode: "normal" });
		bind([":"], () => openCommandBar(), { mode: "normal" });
		// Ctrl+S saves in normal mode (Vim-style; insert stays untouched).
		bind(["ctrl+s"], () => session.save(), { mode: "normal" });
		// Undo/redo also live in normal mode; insert stays untouched.
		bind(["u"], () => controller.execute("history.undo"), { mode: "normal" });
		bind(["ctrl+r"], () => controller.execute("history.redo"), { mode: "normal" });

		return () => {
			removeWildcard();
			unbinds.forEach((fn) => fn());
		};
	}, [
		boundKeyboard,
		controller,
		enableWildcardPriority,
		getCurrentMode,
		openCommandBar,
		registryCompositionKey,
		removeCompositionKey,
		switchMode,
		session,
	]);

	const ref = useRef(null);
	const { height, width } = useBoxMetrics(ref);

	const doc = controller.document;
	const lineNumberWidth = doc.getLineNumberWidth();
	// Soft-wrap the text at the editable width minus one cell, leaving a
	// right-hand margin so the last column never hugs the edge.
	doc.setWrapWidth(width - lineNumberWidth - lineNumberRightSpacing - 1);
	const visibleStart = doc.updateScroll(height);
	const effectiveH = height > 0 ? height : doc.visualLineCount;
	const cursor = doc.cursor;
	const cursorVisualLine = doc.cursorVisualLine;
	const cursorX = doc.cursorSegmentVisual + lineNumberWidth + lineNumberRightSpacing + cursorOffset;
	const cursorY = cursorVisualLine - visibleStart + cursorHeightOffset;

	setCursorPosition({ x: cursorX, y: cursorY });

	// Mouse: clicks position the cursor in any mode. A plain wheel moves the
	// cursor one visual line per notch; Ctrl+wheel scrolls the view without
	// moving the cursor (clamped to the document). Callbacks close over this
	// render's metrics.
	const mouseRef = useMouseRegion({
		onClick: (event, rect) => {
			const target = clickToPosition(
				event,
				rect,
				lineNumberWidth + lineNumberRightSpacing,
				doc.scrollTop,
				doc,
			);
			controller.execute("cursor.setPosition", {
				line: target.line,
				logical: target.logical,
			});
		},
		onWheel: (event) => {
			const up = event.button === "wheel-up";
			const down = event.button === "wheel-down";
			if (!up && !down) {
				return;
			}
			if (event.ctrl) {
				// Ctrl+wheel scrolls the view at `view` lines per notch
				// (clamped to the document); the cursor does not move.
				controller.execute("view.scroll", {
					delta: up ? -settings.wheel.view : settings.wheel.view,
					height,
				});
				return;
			}
			// Plain wheel moves the cursor at `cursor` lines per notch.
			controller.execute(up ? "cursor.pageUp" : "cursor.pageDown", {
				height: settings.wheel.cursor,
			});
		},
	});

	const modeText = mode === "normal" ? t("editor.mode.normal") : t("editor.mode.insert");

	return (
		<Box flexDirection="column" height="100%" width="100%">
			<InformationBar
				mode={modeText}
				cursor={{ line: cursor.line, column: cursor.visual }}
				session={session}
			/>
			<Box ref={mouseRef} flexGrow={1} width="100%" backgroundColor="#1e1e1e">
				<Box ref={ref} height="100%" width="100%" flexDirection="column">
					{Array.from({ length: effectiveH }, (_, i) => {
						const vline = visibleStart + i;
						const seg = doc.visualLineAt(vline);

						if (!seg) {
							return null;
						}
						return (
							<Box key={vline} flexDirection="row">
								<Box
									width={lineNumberWidth}
									justifyContent="flex-end"
									marginRight={lineNumberRightSpacing}
								>
									{seg.first ? <Text bold={cursor.line === seg.line}>{seg.line}</Text> : null}
								</Box>
								{/* seg.text is tab-expanded; raw tabs would render at the
									terminal tab stops and scramble the layout. */}
								<Text>{seg.text}</Text>
							</Box>
						);
					})}
				</Box>
			</Box>
		</Box>
	);
}
