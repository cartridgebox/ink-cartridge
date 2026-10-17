/**
 * Dormant page key — a layer temporarily disables a page binding.
 *
 * The `x` binding is registered with `stopsWorkingAfterLayerAppearing` and a
 * `focusId` — the combination that needs the page-layer registration to store
 * the flag. While a layer is open the page binding is skipped, so pressing `x`
 * leaves the counter untouched; close the layer and `x` answers again.
 *
 * Controls:
 *   x — count a press (page binding)
 *   a — open the layer        esc — close it        q — quit
 *
 * Run:
 *   npx tsx examples/core/dormant-key.tsx
 */
import { Box, render, Text, useWindowSize } from "ink";
import React, { useEffect, useState } from "react";
import {
	CurrentScreen,
	KeyboardProvider,
	registerComponent,
	ScenarioManagementProvider,
	useKeyboard,
	useScreenSystem,
} from "../../src/index.js";

const OVERLAY_W = 46;
const OVERLAY_H = 7;

function Main() {
	const { allLayers, openLayer, applyElement } = useScreenSystem();
	const { boundKeyboard } = useKeyboard();
	const [count, setCount] = useState(0);

	useEffect(() => {
		const unbindCount = boundKeyboard(["x"], () => setCount((n) => n + 1), {
			focusId: "dormant-x",
			stopsWorkingAfterLayerAppearing: true,
		});
		const unbindOpen = boundKeyboard(["a"], () => {
			openLayer("dormant-layer", 1);
			applyElement("dormant-layer", {
				element: DormantLayer,
				elementId: "dormant-el",
			});
		});
		const unbindQuit = boundKeyboard(["q"], () => process.exit(0));
		return () => {
			unbindCount();
			unbindOpen();
			unbindQuit();
		};
	}, [applyElement, boundKeyboard, openLayer]);

	const dormant = allLayers.length > 0;

	return (
		<Box height="100%" width="100%" flexDirection="column">
			<Text bold color="green">stopsWorkingAfterLayerAppearing</Text>
			<Text>x presses: {count}</Text>
			<Text color={dormant ? "yellow" : undefined} dimColor={dormant}>
				{dormant ? "x is dormant while the layer is open" : "x is active"}
			</Text>
			<Text dimColor>a: open the layer · q: quit</Text>
		</Box>
	);
}

registerComponent(Main, {});

function DormantLayer() {
	const { closeLayer } = useScreenSystem();
	const { boundKeyboard } = useKeyboard();
	const { columns, rows } = useWindowSize();
	const top = Math.max(0, Math.floor((rows - OVERLAY_H) / 2));
	const left = Math.max(0, Math.floor((columns - OVERLAY_W) / 2));

	useEffect(() => {
		const unbindClose = boundKeyboard(["escape"], () =>
			closeLayer("dormant-layer"),
		);
		return unbindClose;
	}, [boundKeyboard, closeLayer]);

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
			<Text bold color="cyan">Layer is open</Text>
			<Text>Press x — the page counter will not move.</Text>
			<Text dimColor>esc: close the layer</Text>
		</Box>
	);
}

registerComponent(DormantLayer, {});

render(
	<ScenarioManagementProvider defaultScreen={Main} fullScreen>
		<KeyboardProvider>
			<CurrentScreen />
		</KeyboardProvider>
	</ScenarioManagementProvider>,
);
