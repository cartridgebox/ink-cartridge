/**
 * Mapping demo — two mappings that share a prefix.
 *
 * `g h` runs "hello" and `g h j` runs "bye". While both are still possible the
 * engine waits, so the longer one keeps its chance. If it never arrives — the
 * wait expires, or a key that matches no candidate is pressed — the already
 * completed `g h` runs instead of being dropped. An unrelated key is not
 * swallowed: it goes on to its own binding.
 *
 * The counters below show which mapping ran; `x` counts its own presses, so
 * pressing `g h` then `x` fires both.
 *
 * Controls:
 *   g h — run "hello" (after the wait, unless `j` follows)
 *   g h j — run "bye"
 *   g h, then wait — "hello" runs when the wait expires
 *   g h, then x — "hello" runs, and x still does its own thing
 *   q — quit
 *
 * Run:
 *   npx tsx examples/keyboard-mapping.tsx
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

// Long enough to watch the ambiguity: type `g h` and wait instead of `j`.
const WAIT_MS = 1200;

function Demo() {
	const {
		addMapping,
		boundKeyboard,
		getLastMappingEvent,
		registryCompositionKey,
		removeCompositionKey,
		removeMappingKey,
		subscribeMapping,
	} = useKeyboard();
	const [helloFired, setHelloFired] = useState(0);
	const [byeFired, setByeFired] = useState(0);
	const [xPressed, setXPressed] = useState(0);
	const [lastEvent, setLastEvent] = useState(() => getLastMappingEvent());

	useEffect(() => {
		// The mapping targets are ordinary composition keys; their `execute`
		// callbacks are what the mapped sequences run.
		registryCompositionKey({
			key: "hello",
			flags: [],
			alternativeFlag: "action",
			needs: [],
			execute: (ctx) => {
				setHelloFired((n) => n + 1);
				return {
					value: undefined,
					lastFlag: "action",
					steps: [...ctx.steps, "hello"],
				};
			},
		});
		registryCompositionKey({
			key: "bye",
			flags: [],
			alternativeFlag: "action",
			needs: [],
			execute: (ctx) => {
				setByeFired((n) => n + 1);
				return {
					value: undefined,
					lastFlag: "action",
					steps: [...ctx.steps, "bye"],
				};
			},
		});
		addMapping(["g", "h"], ["hello"], { timeout: WAIT_MS });
		addMapping(["g", "h", "j"], ["bye"], { timeout: WAIT_MS });

		return () => {
			removeMappingKey(["g", "h"]);
			removeMappingKey(["g", "h", "j"]);
			removeCompositionKey("hello");
			removeCompositionKey("bye");
		};
	}, []);

	useEffect(() => subscribeMapping(() => setLastEvent(getLastMappingEvent())), []);

	useEffect(() => {
		const unbindX = boundKeyboard(["x"], () => setXPressed((n) => n + 1));
		const unbindQuit = boundKeyboard(["q"], () => process.exit(0));
		return () => {
			unbindX();
			unbindQuit();
		};
	}, []);

	const last = lastEvent
		? "key" in lastEvent
			? `${lastEvent.type} (${lastEvent.key})`
			: lastEvent.type
		: "—";

	return (
		<Box height="100%" width="100%" flexDirection="column">
			<Text bold color="green">Mapping keys — "gh" and "ghj" share a prefix</Text>
			<Text>
				last mapping event: <Text color="cyan">{last}</Text>
			</Text>
			<Text>
				hello fired: {helloFired} · bye fired: {byeFired} · x pressed: {xPressed}
			</Text>
			<Text dimColor>
				g h: wait {WAIT_MS}ms unless j follows · g h j: run bye · g h then x: hello runs and x counts · q: quit
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
