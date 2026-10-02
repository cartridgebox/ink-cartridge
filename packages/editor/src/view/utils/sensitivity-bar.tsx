import { useI18n } from "@cartridge-engine/i18n";
import { Box, Text } from "ink";
import { useMouseRegion } from "ink-cartridge";
import React from "react";

export const SENSITIVITY_MIN = 1;
export const SENSITIVITY_MAX = 10;
export const SENSITIVITY_STEP = 0.5;

/** Number of steps a `min..max` range of `step` size spans. */
export function stepsFor(min: number, max: number, step: number): number {
	return Math.round((max - min) / step);
}

/** Map a 0..1 ratio to a value snapped to `step`, clamped to `min..max`. */
export function valueFromRatio(
	ratio: number,
	min = SENSITIVITY_MIN,
	max = SENSITIVITY_MAX,
	step = SENSITIVITY_STEP,
): number {
	const r = Math.max(0, Math.min(1, ratio));
	return min + Math.round(r * stepsFor(min, max, step)) * step;
}

/** Clamp value + dir*step to the valid 1..10 range (0.5 steps). */
export function snapSensitivity(value: number, dir: 1 | -1): number {
	return snapValue(value, dir, SENSITIVITY_MIN, SENSITIVITY_MAX, SENSITIVITY_STEP);
}

/** Clamp value + dir*step to an arbitrary `min..max` range. */
export function snapValue(
	value: number,
	dir: 1 | -1,
	min: number,
	max: number,
	step: number,
): number {
	return Math.min(max, Math.max(min, value + dir * step));
}

type SliderProps = {
	value: number;
	min: number;
	max: number;
	step: number;
	/** Called on click/drag with the new value (in-memory draft). */
	onChange: (value: number) => void;
	/** Called when the interaction ends — persist the draft. */
	onCommit: () => void;
	/** Localized hint rendered under the bar. */
	hint: string;
};

/**
 * Mouse-driven slider over an arbitrary `min..max`/`step` range. Clicking or
 * dragging anywhere on the bar sets the value proportionally, snapped to
 * `step`; the fuller the bar, the higher the value.
 */
export function Slider({ value, min, max, step, onChange, onCommit, hint }: SliderProps) {
	const steps = stepsFor(min, max, step);
	const valueFromX = (localX: number) =>
		valueFromRatio(localX / steps, min, max, step);
	// priority 1: the bar sits inside the draggable ModalFrame, whose region
	// overlaps it — the child control must always win the hit test, no matter
	// the registration order after frame drags.
	const ref = useMouseRegion(
		{
			onClick: (event, rect) => {
				onChange(valueFromX(event.x - rect.x));
				onCommit();
			},
			onDragStart: (event, rect) => onChange(valueFromX(event.x - rect.x)),
			onDragMove: (event, rect) => onChange(valueFromX(event.x - rect.x)),
			onDragEnd: () => onCommit(),
		},
		{ priority: 1 },
	);
	const filled = Math.round((value - min) / step);
	return (
		<Box flexDirection="column" alignItems="center" gap={1}>
			<Box ref={ref} flexDirection="row">
				<Text>{filled > 0 ? "█".repeat(filled) : ""}</Text>
				<Text dimColor>{"░".repeat(steps - filled)}</Text>
			</Box>
			<Text dimColor>{hint}</Text>
		</Box>
	);
}

type SensitivityBarProps = {
	value: number;
	/** Called on click/drag with the new value (in-memory draft). */
	onChange: (value: number) => void;
	/** Called when the interaction ends — persist the draft. */
	onCommit: () => void;
};

/** Slider preset for the 1..10 wheel sensitivity range. */
export function SensitivityBar({ value, onChange, onCommit }: SensitivityBarProps) {
	const { t } = useI18n();
	return (
		<Slider
			value={value}
			min={SENSITIVITY_MIN}
			max={SENSITIVITY_MAX}
			step={SENSITIVITY_STEP}
			onChange={onChange}
			onCommit={onCommit}
			hint={t("settings.sensitivity.hint")}
		/>
	);
}
