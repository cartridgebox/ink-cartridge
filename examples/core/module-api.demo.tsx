import { Box, render, Text } from "ink";
import React, { useEffect, useState } from "react";
import {
	CurrentScreen,
	KeyboardProvider,
	ScenarioManagementProvider,
	registerComponent,
	// Module-level keyboard API — plain imports, no `useKeyboard`, no hooks.
	addProcessor,
	getCurrentMode,
	getEngine,
	getProcessors,
	globalKeys,
	nextMode,
	removeProcessor,
	setProcessorWeight,
	withOwner,
} from "../../src/index.js";

/**
 * Module-level keyboard API demo.
 *
 * Every keyboard call below is a plain imported function. They resolve the
 * engine mounted by <KeyboardProvider>, so the same code can live in any
 * module of your app — a store, a timer, an async task — not just a component.
 */

const MODES = ["normal", "insert", "visual"];
const COUNTER_ID = "key-counter";
const HIGH_WEIGHT = 9000; // above every built-in stage (modal = 8000)
const LOW_WEIGHT = 100;

// Plain module state — deliberately NOT a React ref.
let keyCount = 0;

/** Install a custom processor that observes (never consumes) every key. */
function installKeyCounter() {
	if (getProcessors().some((p) => p.id === COUNTER_ID)) return;
	addProcessor(
		{
			id: COUNTER_ID,
			active: true,
			process: () => {
				keyCount += 1;
				return false; // observe only, let the event continue
			},
		},
		{ weight: HIGH_WEIGHT },
	);
}

/** Re-weight the counter between the top and the bottom of the pipeline. */
function toggleCounterWeight() {
	const counter = getProcessors().find((p) => p.id === COUNTER_ID);
	if (!counter) return;
	setProcessorWeight(
		COUNTER_ID,
		counter.weight > LOW_WEIGHT * 2 ? LOW_WEIGHT : HIGH_WEIGHT,
	);
}

function Demo() {
	const [, setTick] = useState(0);

	// Re-render on a timer so state mutated from plain logic shows up.
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), 200);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		// `withOwner` attributes a manually-created binding to this page — the
		// module-level twin of `useKeyboard().boundKeyboard`.
		const unbind = withOwner(Demo, () => {
			const offMode = getEngine().boundKeyboard(["m"], () => nextMode());
			const offWeight = getEngine().boundKeyboard(["w"], toggleCounterWeight);
			const offQuit = getEngine().boundKeyboard(["q"], () => process.exit(0));
			return () => {
				offMode();
				offWeight();
				offQuit();
			};
		});

		// Global keys registered without React at all.
		globalKeys([
			{ key: "ctrl+k", operate: installKeyCounter },
			{ key: "ctrl+d", operate: () => removeProcessor(COUNTER_ID) },
		]);

		// A far-flung piece of logic: rotate the mode on a timer.
		const modeTimer = setInterval(nextMode, 3000);

		return () => {
			unbind();
			globalKeys([]);
			clearInterval(modeTimer);
			removeProcessor(COUNTER_ID);
		};
	}, []);

	// Safe to read during render: the provider registers the engine during its
	// own render, before any child (this screen) renders.
	const processors = getProcessors();
	const mode = getCurrentMode();

	return (
		<Box
			height="100%"
			width="100%"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			borderStyle="round"
			borderColor="cyan"
			gap={1}
		>
			<Text bold underline>
				module-level keyboard API
			</Text>

			<Text>
				mode: <Text color="green">{mode ?? "-"}</Text>{" "}
				<Text dimColor>(auto-rotates every 3s from plain logic)</Text>
			</Text>

			<Text>
				key presses observed: <Text color="yellow">{keyCount}</Text>
			</Text>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>processors (weight desc):</Text>
				{[...processors]
					.sort((a, b) => b.weight - a.weight)
					.map((p) => (
						<Text key={p.id}>
							{"  "}
							<Text color={p.active ? "green" : "red"}>
								{p.active ? "on " : "off"}
							</Text>{" "}
							{p.id} <Text dimColor>w={p.weight}</Text>
						</Text>
					))}
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>ctrl+k add counter · ctrl+d remove counter</Text>
				<Text dimColor>m next mode · w toggle weight · q quit</Text>
			</Box>
		</Box>
	);
}

registerComponent(Demo, {});

render(
	<ScenarioManagementProvider defaultScreen={Demo} fullScreen>
		<KeyboardProvider modes={MODES} defaultMode="normal">
			<CurrentScreen />
		</KeyboardProvider>
	</ScenarioManagementProvider>,
);
