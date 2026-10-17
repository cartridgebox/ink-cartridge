/**
 * Composition demo — a vim-style count chain that survives a wrong key.
 *
 * `3` starts a chain that expects `w` next. With `exclusive: true` any other
 * key is swallowed instead of breaking the chain: the wait restarts, the hint
 * stays up, and the key never reaches lower pipeline stages. When that wait
 * finally expires the chain completes like any other — it is recorded in the
 * undo buffer and announced as `completed` — which is what `u` undoes.
 *
 * Try it: press `3`, then `x` (not a chain key) — the chain keeps waiting and
 * the last event reads `consumed`. Wait for the timeout and it ends as
 * `completed`, with one entry in the undo buffer.
 *
 * Controls:
 *   3 — start the chain           w — finish it ("3w")
 *   x — any other key while waiting: swallowed, the wait restarts
 *   u — undo the last completed chain        q — quit
 *
 * Run:
 *   npx tsx examples/keyboard-composition.tsx
 */
import { Box, render, Text } from "ink";
import React, { useEffect, useState } from "react";
import {
	CurrentScreen,
	KeyboardProvider,
	registerComponent,
	ScenarioManagementProvider,
	useKeyboard,
} from "../src/index.js";

const CHAIN_TIMEOUT_MS = 1500;

function Demo() {
	const {
		boundKeyboard,
		bufferedCompositionCount,
		getCompositionContext,
		getLastCompositionEvent,
		hasPendingComposition,
		registryCompositionKey,
		removeCompositionKey,
		subscribeComposition,
		undoComposition,
	} = useKeyboard();
	const [, setTick] = useState(0);
	const [undone, setUndone] = useState<string | null>(null);

	useEffect(() => {
		registryCompositionKey({
			key: "3",
			flags: [],
			alternativeFlag: "times",
			needs: [],
			timeout: CHAIN_TIMEOUT_MS,
			exclusive: true,
			execute: (ctx) => ({
				value: 3,
				lastFlag: "times",
				steps: [...ctx.steps, "3"],
			}),
		});
		registryCompositionKey({
			key: "w",
			flags: [],
			alternativeFlag: "action",
			needs: ["times"],
			timeout: CHAIN_TIMEOUT_MS,
			execute: (ctx) => ({
				value: ctx.value,
				lastFlag: "action",
				steps: [...ctx.steps, "w"],
			}),
		});
		return () => {
			removeCompositionKey("3");
			removeCompositionKey("w");
		};
	}, []);

	// Every composition event (started, continued, consumed, completed) is a
	// reason to re-render: the lines below read the engine's state at render.
	useEffect(() => subscribeComposition(() => setTick((t) => t + 1)), []);

	useEffect(() => {
		const unbindUndo = boundKeyboard(["u"], () => {
			const result = undoComposition();
			setUndone(result ? result.steps.join(" · ") : null);
		});
		const unbindQuit = boundKeyboard(["q"], () => process.exit(0));
		return () => {
			unbindUndo();
			unbindQuit();
		};
	}, []);

	const pending = hasPendingComposition();
	const context = getCompositionContext();
	const last = getLastCompositionEvent();
	const lastLabel = last
		? "key" in last
			? `${last.type} (${last.key})`
			: last.type
		: "—";

	return (
		<Box height="100%" width="100%" flexDirection="column">
			<Text bold color="green">Composition — an exclusive "3w" chain</Text>
			<Text>
				pending: {pending ? <Text color="yellow">WAITING for the next key</Text> : <Text dimColor>idle</Text>}
			</Text>
			<Text>steps: {context.steps.length > 0 ? context.steps.join(" · ") : "—"}</Text>
			<Text>value: {context.value === undefined ? "—" : String(context.value)}</Text>
			<Text>
				last event: <Text color="cyan">{lastLabel}</Text>
			</Text>
			<Text>undo buffer: {bufferedCompositionCount()}</Text>
			<Text>undone: {undone ?? "—"}</Text>
			<Text dimColor>
				3: start · w: finish · x: swallowed while waiting · u: undo · q: quit
			</Text>
		</Box>
	);
}

registerComponent(Demo, {});

render(
	<ScenarioManagementProvider defaultScreen={Demo} fullScreen>
		<KeyboardProvider>
			<CurrentScreen />
		</KeyboardProvider>
	</ScenarioManagementProvider>,
);
