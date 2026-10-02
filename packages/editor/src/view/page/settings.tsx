import { useI18n } from "@cartridge-engine/i18n";
import { Box, Text } from "ink";
import {
	back,
	ModalLayerElementContext,
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
import {
	MERGE_WINDOW_MAX,
	MERGE_WINDOW_MIN,
	MERGE_WINDOW_STEP,
	type WheelSensitivity,
} from "../../core/settings/schema.js";
import { useSettings } from "../../core/settings/useSettings.js";
import { ModalFrame } from "../utils/modal-frame.js";
import {
	SensitivityBar,
	Slider,
	snapSensitivity,
	snapValue,
} from "../utils/sensitivity-bar.js";

const LANGUAGES = [
	{ code: "en", labelKey: "settings.language.en" },
	{ code: "zh", labelKey: "settings.language.zh" },
] as const;

type LanguageRowProps = {
	label: string;
	selected: boolean;
	active: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onClick: () => void;
};

/** Selectable language row with the same hover-highlight style as the menu. */
function LanguageRow({
	label,
	selected,
	active,
	onEnter,
	onLeave,
	onClick,
}: LanguageRowProps) {
	// priority 1: rows live inside the draggable ModalFrame; the child must
	// always win the hit test over the overlapping frame region.
	const ref = useMouseRegion({ onEnter, onLeave, onClick }, { priority: 1 });
	return (
		<Box ref={ref} paddingLeft={1} paddingRight={1}>
			<Text inverse={active}>
				{active ? "> " : "  "}
				{label}
				{selected ? " *" : ""}
			</Text>
		</Box>
	);
}

/**
 * Modal language picker, opened from the settings screen. While open it owns
 * the keyboard (modal layer takeover); picking a language applies it and
 * closes, Esc cancels without changing anything.
 */
function LanguagePicker() {
	const ctx = useContext(ModalLayerElementContext);
	const { t, setLanguage: setI18nLanguage, currentLanguage } = useI18n();
	const { setLanguage: persistLanguage } = useSettings();
	const { boundKeyboard } = useKeyboard();
	const { closeModalLayer } = useScreenSystem();
	const [index, setIndex] = useState(0);
	const [hovered, setHovered] = useState<number | null>(null);

	const applyLanguage = useCallback(
		(code: string) => {
			setI18nLanguage(code);
			persistLanguage(code);
		},
		[setI18nLanguage, persistLanguage],
	);

	useEffect(() => {
		if (!ctx) {
			return;
		}
		const unbinds = [
			boundKeyboard(
				["up"],
				() => setIndex((i) => Math.max(0, i - 1)),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["down"],
				() => setIndex((i) => Math.min(LANGUAGES.length - 1, i + 1)),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["return"],
				() => {
					applyLanguage(LANGUAGES[index].code);
					closeModalLayer(ctx.modalLayer.layerId);
				},
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["escape"],
				() => closeModalLayer(ctx.modalLayer.layerId),
				{ elementId: ctx.id },
			),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [applyLanguage, boundKeyboard, closeModalLayer, ctx, index]);

	const apply = (code: string) => {
		if (!ctx) {
			return;
		}
		applyLanguage(code);
		closeModalLayer(ctx.modalLayer.layerId);
	};

	return (
		<ModalFrame
			title={t("settings.language")}
			footer={<Text dimColor>{t("settings.back")} (Esc)</Text>}
		>
			{LANGUAGES.map((lang, i) => (
				<LanguageRow
					key={lang.code}
					label={t(lang.labelKey)}
					selected={currentLanguage === lang.code}
					active={i === index || hovered === i}
					onEnter={() => setHovered(i)}
					onLeave={() => setHovered((h) => (h === i ? null : h))}
					onClick={() => apply(lang.code)}
				/>
			))}
		</ModalFrame>
	);
}

type SensitivityPickerProps = {
	sensitivityKey: keyof WheelSensitivity;
};

/**
 * Modal slider for one wheel sensitivity (cursor or view). The bar is
 * drag/click driven; dragging updates in memory only, release/click persists.
 */
function SensitivityPicker({ sensitivityKey }: SensitivityPickerProps) {
	const ctx = useContext(ModalLayerElementContext);
	const { t } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const { closeModalLayer } = useScreenSystem();
	const { settings, setDraft, setSensitivity, commit } = useSettings();
	const value = settings.wheel[sensitivityKey];

	useEffect(() => {
		if (!ctx) {
			return;
		}
		const unbinds = [
			boundKeyboard(
				["left"],
				() => setSensitivity(sensitivityKey, snapSensitivity(value, -1)),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["right"],
				() => setSensitivity(sensitivityKey, snapSensitivity(value, 1)),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["escape"],
				() => closeModalLayer(ctx.modalLayer.layerId),
				{ elementId: ctx.id },
			),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [boundKeyboard, closeModalLayer, ctx, sensitivityKey, value, setSensitivity]);

	const labelKey =
		sensitivityKey === "cursor"
			? "settings.sensitivity.cursor"
			: "settings.sensitivity.view";

	return (
		<ModalFrame
			title={t(labelKey)}
			footer={<Text dimColor>{t("settings.back")} (Esc)</Text>}
		>
			<SensitivityBar
				value={value}
				onChange={(v) => setDraft(sensitivityKey, v)}
				onCommit={commit}
			/>
			<Text>{value.toFixed(1)}×</Text>
		</ModalFrame>
	);
}

/**
 * Modal slider for the undo merge window. The bar is drag/click driven;
 * dragging updates in memory only, release/click persists. `0` disables
 * merging, so the label reads "off" instead of the bare number.
 */
function MergeWindowPicker() {
	const ctx = useContext(ModalLayerElementContext);
	const { t } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const { closeModalLayer } = useScreenSystem();
	const { settings, setMergeWindow, setMergeWindowDraft, commit } = useSettings();
	const value = settings.history.mergeWindow;

	useEffect(() => {
		if (!ctx) {
			return;
		}
		const snap = (dir: 1 | -1) =>
			snapValue(value, dir, MERGE_WINDOW_MIN, MERGE_WINDOW_MAX, MERGE_WINDOW_STEP);
		const unbinds = [
			boundKeyboard(["left"], () => setMergeWindow(snap(-1)), {
				elementId: ctx.id,
			}),
			boundKeyboard(["right"], () => setMergeWindow(snap(1)), {
				elementId: ctx.id,
			}),
			boundKeyboard(
				["escape"],
				() => closeModalLayer(ctx.modalLayer.layerId),
				{ elementId: ctx.id },
			),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [boundKeyboard, closeModalLayer, ctx, setMergeWindow, value]);

	return (
		<ModalFrame
			title={t("settings.mergeWindow")}
			footer={<Text dimColor>{t("settings.back")} (Esc)</Text>}
		>
			<Slider
				value={value}
				min={MERGE_WINDOW_MIN}
				max={MERGE_WINDOW_MAX}
				step={MERGE_WINDOW_STEP}
				onChange={setMergeWindowDraft}
				onCommit={commit}
				hint={t("settings.slider.hint")}
			/>
			<Text>
				{value === MERGE_WINDOW_MIN
					? t("settings.mergeWindow.off")
					: `${value} ms`}
			</Text>
		</ModalFrame>
	);
}

type PickerButtonProps = {
	label: string;
	active: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onClick: () => void;
};

/** Small clickable button used inside the file-tree-root picker. */
function PickerButton({ label, active, onEnter, onLeave, onClick }: PickerButtonProps) {
	const ref = useMouseRegion({ onEnter, onLeave, onClick }, { priority: 1 });
	return (
		<Box ref={ref} paddingLeft={1} paddingRight={1}>
			<Text inverse={active}>{label}</Text>
		</Box>
	);
}

/**
 * Modal picker for the file-tree root: startup directory or a custom path.
 * Up/down switches the mode; while "custom" is active the row is a text
 * input (any key appends, backspace deletes). Return confirms, Esc cancels.
 */
function FileTreePicker() {
	const ctx = useContext(ModalLayerElementContext);
	const { t } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const { closeModalLayer } = useScreenSystem();
	const { settings, setFileTree } = useSettings();
	const [root, setRoot] = useState<"startup" | "custom">(settings.fileTree.root);
	const [path, setPath] = useState(settings.fileTree.customPath);
	const [hovered, setHovered] = useState<"ok" | "cancel" | null>(null);
	// The wildcard handler needs the current mode without rebinding on
	// every keystroke; a ref keeps it fresh.
	const rootRef = useRef(root);
	rootRef.current = root;

	const apply = useCallback(() => {
		if (!ctx) {
			return;
		}
		setFileTree({
			root,
			customPath: root === "custom" ? path : "",
		});
		closeModalLayer(ctx.modalLayer.layerId);
	}, [closeModalLayer, ctx, path, root, setFileTree]);

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
				["up"],
				() => setRoot((r) => (r === "custom" ? "startup" : "custom")),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["down"],
				() => setRoot((r) => (r === "custom" ? "startup" : "custom")),
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["*"],
				(ch) => {
					// Typing only makes sense while editing a custom path.
					if (rootRef.current === "custom") {
						setPath((p) => p + ch);
					}
				},
				{ elementId: ctx.id },
			),
			boundKeyboard(
				["backspace"],
				() => {
					if (rootRef.current === "custom") {
						setPath((p) => p.slice(0, -1));
					}
				},
				{ elementId: ctx.id },
			),
			boundKeyboard(["return"], apply, { elementId: ctx.id }),
			boundKeyboard(["escape"], close, { elementId: ctx.id }),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [apply, boundKeyboard, close, ctx]);

	return (
		<ModalFrame title={t("settings.fileTreeRoot")}>
			<Box flexDirection="column">
				<Text inverse={root === "startup"}>
					{root === "startup" ? "▸ " : "  "}
					{t("settings.fileTreeRoot.startup")}
				</Text>
				<Text inverse={root === "custom"}>
					{root === "custom" ? "▸ " : "  "}
					{t("settings.fileTreeRoot.custom")}
					{": "}
					<Text color={root === "custom" ? undefined : "gray"}>
						{path}
						{root === "custom" ? "▌" : ""}
					</Text>
				</Text>
			</Box>
			<Box flexDirection="row" gap={2}>
				<PickerButton
					label={t("settings.ok")}
					active={hovered === "ok"}
					onEnter={() => setHovered("ok")}
					onLeave={() => setHovered((h) => (h === "ok" ? null : h))}
					onClick={apply}
				/>
				<PickerButton
					label={t("settings.cancel")}
					active={hovered === "cancel"}
					onEnter={() => setHovered("cancel")}
					onLeave={() => setHovered((h) => (h === "cancel" ? null : h))}
					onClick={close}
				/>
			</Box>
		</ModalFrame>
	);
}

type SettingRowProps = {
	label: string;
	value: string;
	active: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onClick: () => void;
};

/** A single settings entry: label plus its current value; opens a picker on
 *  activation. priority 1: rows live inside the draggable ModalFrame in the
 *  in-editor settings layer and must win over the frame region. */
function SettingRow({
	label,
	value,
	active,
	onEnter,
	onLeave,
	onClick,
}: SettingRowProps) {
	const ref = useMouseRegion({ onEnter, onLeave, onClick }, { priority: 1 });
	return (
		<Box ref={ref} paddingLeft={1} paddingRight={1} flexDirection="row" gap={2}>
			<Text inverse={active}>
				{active ? "> " : "  "}
				{label}
			</Text>
			<Text dimColor>{value}</Text>
		</Box>
	);
}

export type SettingsEntriesProps = {
	/** Called on Esc/Backspace — the screen navigates back, the in-editor
	 *  settings layer closes itself. */
	onExit: () => void;
};

/**
 * The setting rows with their keyboard navigation and modal pickers.
 * Shared by the settings screen and the in-editor settings layer; the only
 * difference is what `onExit` does.
 */
export function SettingsEntries({ onExit }: SettingsEntriesProps) {
	const { t, currentLanguage } = useI18n();
	const { boundKeyboard } = useKeyboard();
	const { openModalLayer, applyElementToModalLayer } = useScreenSystem();
	const { settings } = useSettings();
	const [index, setIndex] = useState(0);
	const [hovered, setHovered] = useState<number | null>(null);

	const openLanguagePicker = useCallback(() => {
		openModalLayer("language", 50);
		applyElementToModalLayer("language", {
			elementId: "language-picker",
			element: LanguagePicker,
		});
	}, [applyElementToModalLayer, openModalLayer]);

	const openSensitivityPicker = useCallback((key: keyof WheelSensitivity) => {
		const id = `sensitivity-${key}`;
		// `element` is a component type; wrap so the picker receives its key.
		const Picker = () => <SensitivityPicker sensitivityKey={key} />;
		openModalLayer(id, 50);
		applyElementToModalLayer(id, {
			elementId: id,
			element: Picker,
		});
	}, [applyElementToModalLayer, openModalLayer]);

	const openFileTreePicker = useCallback(() => {
		openModalLayer("file-tree-root", 50);
		applyElementToModalLayer("file-tree-root", {
			elementId: "file-tree-root-picker",
			element: FileTreePicker,
		});
	}, [applyElementToModalLayer, openModalLayer]);

	const openMergeWindowPicker = useCallback(() => {
		openModalLayer("merge-window", 50);
		applyElementToModalLayer("merge-window", {
			elementId: "merge-window-picker",
			element: MergeWindowPicker,
		});
	}, [applyElementToModalLayer, openModalLayer]);

	const currentLabel =
		LANGUAGES.find((lang) => lang.code === currentLanguage)?.labelKey ??
		"settings.language.en";

	const entries = useMemo(
		() => [
			{
				id: "language",
				label: t("settings.language"),
				value: t(currentLabel),
				open: openLanguagePicker,
			},
			{
				id: "cursor",
				label: t("settings.sensitivity.cursor"),
				value: `${settings.wheel.cursor.toFixed(1)}×`,
				open: () => openSensitivityPicker("cursor"),
			},
			{
				id: "view",
				label: t("settings.sensitivity.view"),
				value: `${settings.wheel.view.toFixed(1)}×`,
				open: () => openSensitivityPicker("view"),
			},
			{
				id: "file-tree-root",
				label: t("settings.fileTreeRoot"),
				value:
					settings.fileTree.root === "custom" && settings.fileTree.customPath
						? settings.fileTree.customPath
						: t("settings.fileTreeRoot.startup"),
				open: openFileTreePicker,
			},
			{
				id: "merge-window",
				label: t("settings.mergeWindow"),
				value:
					settings.history.mergeWindow === MERGE_WINDOW_MIN
						? t("settings.mergeWindow.off")
						: `${settings.history.mergeWindow} ms`,
				open: openMergeWindowPicker,
			},
		],
		[
			t,
			currentLabel,
			settings.wheel.cursor,
			settings.wheel.view,
			settings.fileTree.root,
			settings.fileTree.customPath,
			settings.history.mergeWindow,
			openLanguagePicker,
			openSensitivityPicker,
			openFileTreePicker,
			openMergeWindowPicker,
		],
	);

	useEffect(() => {
		const unbinds = [
			boundKeyboard(["up"], () => setIndex((i) => Math.max(0, i - 1))),
			boundKeyboard(
				["down"],
				() => setIndex((i) => Math.min(entries.length - 1, i + 1)),
			),
			boundKeyboard(["return"], () => entries[index].open()),
			boundKeyboard(["escape", "backspace"], () => onExit()),
		];
		return () => unbinds.forEach((fn) => fn());
	}, [boundKeyboard, entries, index, onExit]);

	return (
		<Box flexDirection="column" gap={2} marginTop={2}>
			{entries.map((entry, i) => (
				<SettingRow
					key={entry.id}
					label={entry.label}
					value={entry.value}
					active={i === index || hovered === i}
					onEnter={() => setHovered(i)}
					onLeave={() => setHovered((h) => (h === i ? null : h))}
					onClick={entry.open}
				/>
			))}
		</Box>
	);
}

export function Settings() {
	const { t } = useI18n();
	return (
		<Box
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
			width="100%"
			height="100%"
			gap={2}
		>
			<Text bold>{t("settings.title")}</Text>
			<SettingsEntries onExit={() => back()} />
			<Box marginTop={4}>
				<Text dimColor>
					{t("settings.back")} (Esc)
				</Text>
			</Box>
		</Box>
	);
}
