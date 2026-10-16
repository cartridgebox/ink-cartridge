/**
 * Pending sequence inside a layer — a "waiting for the next key" hint.
 *
 * A layer element asks the keyboard engine whether its own multi-key sequence
 * is mid-way with `currentScreenHasSequenceWaiting()`: the owner decides the
 * scope, so the call reports the sequence of the layer the element lives in.
 * The hint turns on as soon as `d` arms the pair and goes off when the pair
 * fires or times out.
 *
 * Controls:
 *   a — open the layer
 *   d d — fire the layer's sequence
 *   esc — close the layer
 *   q — quit
 *
 * Run:
 *   npx tsx examples/core/pending-state-layer.tsx
 */
import { Box, render, Text, useWindowSize } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import {
	CurrentScreen,
	KeyboardProvider,
	registerComponent,
	ScenarioManagementProvider,
	useKeyboard,
	useScreenSystem,
} from "../../src/index.js";

const OVERLAY_W = 44;
const OVERLAY_H = 7;

function Main() {
	const { openLayer, applyElement } = useScreenSystem();
	const { boundKeyboard } = useKeyboard();

	useEffect(() => {
		const unbindOpen = boundKeyboard(["a"], () => {
			openLayer("seq-layer", 1);
			applyElement("seq-layer", {
				element: SeqLayer,
				elementId: "seq-layer-el",
			});
		});
		const unbindQuit = boundKeyboard(["q"], () => process.exit(0));
		return () => {
			unbindOpen();
			unbindQuit();
		};
	}, [applyElement, boundKeyboard, openLayer]);

	return (
		<Box height="100%" width="100%" flexDirection="column">
			<Text bold color="green">Layer sequence demo</Text>
			<Text>a: open the layer</Text>
			<Text dimColor>q: quit</Text>
		</Box>
	);
}

registerComponent(Main, {});

function SeqLayer() {
	const { closeLayer } = useScreenSystem();
	const { boundKeyboard, boundSequence, currentScreenHasSequenceWaiting } =
		useKeyboard();
	const [fired, setFired] = useState(0);
	const [, setTick] = useState(0);
	// Stable identity, so re-rendering does not pile up sync callbacks: the
	// engine calls it after every key press to let the hint re-render.
	const sync = useCallback(() => setTick((t) => t + 1), []);
	const { columns, rows } = useWindowSize();
	const top = Math.max(0, Math.floor((rows - OVERLAY_H) / 2));
	const left = Math.max(0, Math.floor((columns - OVERLAY_W) / 2));

	useEffect(() => {
		const unbindSeq = boundSequence(["d", "d"], () => setFired((n) => n + 1));
		const unbindClose = boundKeyboard(["escape"], () => closeLayer("seq-layer"));
		return () => {
			unbindSeq();
			unbindClose();
		};
	}, [boundKeyboard, boundSequence, closeLayer]);

	const waiting = currentScreenHasSequenceWaiting(sync);

	return (
		<Box
			position="absolute"
			top={top}
			left={left}
			width={OVERLAY_W}
			height={OVERLAY_H}
			borderStyle="bold"
			borderColor="cyan"
			backgroundColor="black"
			flexDirection="column"
		>
			<Text bold color="cyan">Layer</Text>
			<Text>
				{waiting ? (
					<Text bold color="yellow">waiting for the second d…</Text>
				) : (
					<Text dimColor>d d: fire the sequence · esc: close</Text>
				)}
			</Text>
			<Text dimColor>fired {fired} time(s)</Text>
		</Box>
	);
}

registerComponent(SeqLayer, {});

render(
	<ScenarioManagementProvider defaultScreen={Main} fullScreen>
		<KeyboardProvider>
			<CurrentScreen />
		</KeyboardProvider>
	</ScenarioManagementProvider>,
);
