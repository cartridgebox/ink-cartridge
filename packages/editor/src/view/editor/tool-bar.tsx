import { useI18n } from "@cartridge-engine/i18n";
import { XtermMouseEvent } from "@cartridge-engine/keyboard-engine";
import { useKeyboard, useMouseRegion } from "ink-cartridge";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import { Box, DOMElement, measureElement, Text, useWindowSize } from "ink";
import { EditorSession } from "../../core/io/session.js";
import { useTree } from "../event/subscription/tree-store.js";
import { EDITOR_PANE, usePaneActive } from "./panes.js";
import {
	getBarPosition,
	setBarPosition,
	useBarPosition,
} from "../event/subscription/toolbar-store.js";
import { clampBarPos } from "../../utils/view/frame-clamp.js";

/**
 * Props for a single tool button.
 *
 * @prop priority - Hit-test priority over whatever sits underneath (the editor
 *   surface). Buttons must win so clicking them does not also place the cursor.
 * @prop onClick - Called on mouse click and on Enter selection in normal
 *   mode; the event is absent for the keyboard path.
 * @prop text - The text to display on the button.
 * @prop focused - Keyboard focus (normal-mode navigation); overrides hover.
 */
export type ToolButtonProps = {
	priority: number;
	onClick: (event?: XtermMouseEvent) => void;
	onDragStart: (event: XtermMouseEvent) => void;
	onDragMove: (event: XtermMouseEvent) => void;
	onDragEnd: (event: XtermMouseEvent) => void;
	text: string;
	focused?: boolean;
};

function ToolButton({
	priority,
	onClick,
	text,
	focused = false,
	onDragStart,
	onDragMove,
	onDragEnd,
}: ToolButtonProps) {
	const [flush, setFlush] = useState<boolean>(false);
	const timerRef = React.useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	const ref = useMouseRegion(
		{
			onClick: (event) => {
				setFlush(true);

				if (timerRef.current) {
					clearTimeout(timerRef.current);
				}
				timerRef.current = setTimeout(() => {
					setFlush(false);
				}, 150);

				onClick(event);
			},
			onDragEnd,
			onDragMove,
			onDragStart,
		},
		{ priority }
	);

	return (
		<Box
			ref={ref}
			borderColor={flush ? "whiteBright" : focused ? "blue" : "white"}
			borderStyle="bold"
			// Match the editor's surface so the floating bar reads as part of it.
			backgroundColor="#1e1e1e"
			height="100%"
			justifyContent="center"
			alignItems="center"
			borderBackgroundColor="#1e1e1e"
			paddingLeft={2}
			paddingRight={2}
		>
			<Text>{text}</Text>
		</Box>
	);
}

export type ToolBarProps = {
	currentMode: string | null;
	session: EditorSession;
	openFileTree: () => void;
	openSettings: () => void;
    fileTreeOpen: boolean;
};

export type ToolButton = {
	onClick: (event?: XtermMouseEvent) => void;
	text: string;
	priority: number;
	id: string;
};

export function ToolBar({
	currentMode,
	session,
	openFileTree,
	openSettings,
    fileTreeOpen,
}: ToolBarProps) {
	const { t } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const [index, setIndex] = useState(0);
	// The toolbar's keys are editor-pane actions. The toolbar lives in a LAYER
	// (processed before the screen), so without this gate its `return` would
	// consume the key ahead of the file tree (now a screen element).
	const editorPaneActive = usePaneActive(EDITOR_PANE);
	const editorPaneActiveRef = useRef(editorPaneActive);
	editorPaneActiveRef.current = editorPaneActive;

	const items: ToolButton[] = useMemo(
		() => [
			{
				id: "save",
				onClick: () => {
					session.save();
				},
				text: t("toolbar.save"),
				priority: 1,
			},
			{
				id: "file-tree",
				onClick: () => {
					openFileTree();
				},
				text: t("toolbar.fileTree"),
				priority: 1,
			},
			{
				id: "settings",
				onClick: () => {
					openSettings();
				},
				text: t("toolbar.settings"),
				priority: 1,
			},
		],
		[session, t, openFileTree, openSettings]
	);

	const { rows, columns } = useWindowSize();
	const pos = useBarPosition();
	const treePos = useTree();
	const barRef = useRef<DOMElement | null>(null);
	// Grab offset (where inside the bar the cursor went down) plus the bar's
	// size at grab time, kept in a ref so drag moves need no re-measurement.
	const grabRef = useRef({ dx: 0, dy: 0, width: 0, height: 0 });

	const treeWidth = treePos.width;

	const startDrag = useCallback((event: XtermMouseEvent) => {
		const node = barRef.current;
		if (!node) {
			return;
		}
		// Measure the bar itself, not the hit region — a button may be the
		// captured target, and its rect would put the bar's corner at the
		// button's corner.
		const m = measureElement(node);
		grabRef.current = {
			dx: event.x - m.x - 1,
			dy: event.y - m.y - 1,
			width: m.width,
			height: m.height,
		};
		setBarPosition({ top: m.y, left: m.x });
	}, []);

	const moveDrag = useCallback(
		(event: XtermMouseEvent) => {
			const { dx, dy, width, height } = grabRef.current;
			setBarPosition(
				clampBarPos(
					event.x - dx - 1,
					event.y - dy - 1,
					width,
					height,
					columns,
					rows,
					fileTreeOpen,
					treeWidth,
				),
			);
		},
		[columns, rows, fileTreeOpen, treeWidth],
	);

	const endDrag = useCallback(() => {}, []);

	// Re-clamp when a layout input changes (resize, tree toggled): a bar
	// positioned earlier can end up outside the allowed region.
	useEffect(() => {
		const node = barRef.current;
		if (!node) {
			return;
		}
		const m = measureElement(node);
		const current = getBarPosition();
		if (!current) {
			return;
		}
		const next = clampBarPos(
			current.left,
			current.top,
			m.width,
			m.height,
			columns,
			rows,
			fileTreeOpen,
			treeWidth,
		);
		if (next.left !== current.left || next.top !== current.top) {
			setBarPosition(next);
		}
	}, [columns, rows, fileTreeOpen, treeWidth]);

	useEffect(() => {
		const whenEditorPane = () => editorPaneActiveRef.current;
		const unbinds = [
			boundKeyboard(["ctrl+left"], () => {
				setIndex((prev) => (prev - 1 + items.length) % items.length);
			}, { when: whenEditorPane }),
			boundKeyboard(["ctrl+right"], () => {
				setIndex((prev) => (prev + 1) % items.length);
			}, { when: whenEditorPane }),
			boundKeyboard(["return"], () => {
				items[index].onClick();
			}, { mode: "normal", when: whenEditorPane }),
		];
		return () => {
			unbinds.forEach((unbind) => unbind());
		};
	}, [boundKeyboard, index, items]);

	const showFocus = currentMode === "normal";

	return (
		<Box width="100%" height="100%" justifyContent="center" alignItems="flex-end">
			<Box
				ref={barRef}
				position={pos ? "absolute" : undefined}
				top={pos?.top}
				left={pos?.left}
				height={3}
				flexDirection="row"
				justifyContent="center"
				alignItems="center"
			>
				{items.map((item, itemIndex) => (
					<ToolButton
						key={item.id}
						onClick={item.onClick}
						text={item.text}
						priority={item.priority}
						focused={showFocus && index === itemIndex}
						onDragStart={startDrag}
						onDragMove={moveDrag}
						onDragEnd={endDrag}
					/>
				))}
			</Box>
		</Box>
	);
}
