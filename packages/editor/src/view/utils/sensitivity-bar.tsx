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

/**
 * Value for a click on cell `localX` (0-based) of a bar that renders exactly
 * `steps + 1` cells — one per value from `min` to `max` inclusive. The ratio
 * therefore runs `localX / steps`, which is exactly one value per cell; using
 * `steps` cells instead would have to skip an interior value to still reach
 * `max` (e.g. 1000 ms, or 5.5×, would be unreachable by mouse).
 */
export function valueFromBarX(
	localX: number,
	min: number,
	max: number,
	step: number,
): number {
	const steps = stepsFor(min, max, step);
	// A zero-width bar (single value) can only mean `min`; avoid /0.
	return steps <= 0 ? min : valueFromRatio(localX / steps, min, max, step);
}

/**
 * Filled-cell count for `value` on the `min..max` bar, matching
 * {@link valueFromBarX}: cell `i` selects `min + i*step`, so the value's own
 * cell is filled and everything left of it too — one cell at `min`, the whole
 * bar at `max`. Deriving the count from that integer cell index — rather than
 * from the value's fraction of the range — keeps the fill aligned with the
 * click mapping: a proportional `fraction * (steps + 1)` rounds unevenly and
 * skips a cell at the midpoint.
 */
export function filledCells(
	value: number,
	min: number,
	max: number,
	step: number,
): number {
	const total = stepsFor(min, max, step) + 1;
	const index = Math.round((value - min) / step);
	return Math.min(total, Math.max(1, index + 1));
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
	const valueFromX = (localX: number) => valueFromBarX(localX, min, max, step);
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
	// One cell per value (min..max inclusive); the fill is derived from the
	// value's own cell, so it matches what a click on that cell would select.
	const total = steps + 1;
	const filled = filledCells(value, min, max, step);
	return (
		<Box flexDirection="column" alignItems="center" gap={1}>
			<Box ref={ref} flexDirection="row">
				<Text>{filled > 0 ? "█".repeat(filled) : ""}</Text>
				<Text dimColor>{"░".repeat(total - filled)}</Text>
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
			hint={t("settings.slider.hint")}
		/>
	);
}
