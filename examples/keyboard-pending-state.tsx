import { Box, render, Text } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { CurrentScreen, KeyboardProvider, registerComponent, ScenarioManagementProvider, useKeyboard } from "../src/index.js";


function App() {
	const { currentScreenHasSequenceWaiting, thereGlobalQueueWaiting, boundSequence, globalSequence } = useKeyboard()
	const [, setTick] = useState(0);
	const sync = useCallback(() => setTick(t => t + 1), []);

	useEffect(() => {
		return boundSequence(['g', 'g'], () => {})
	}, [boundSequence])

	useEffect(() => {
		globalSequence([
			{
				keys: ['d', 'd'],
				operate: () => {}
			}
		])

		return () => globalSequence([])
	}, [globalSequence])

	const hasLayerPending = currentScreenHasSequenceWaiting(sync)
	const hasGlobalPending = thereGlobalQueueWaiting(sync)

	return (
		<Box
			height='100%'
			width='100%'
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
			borderStyle='bold'
			borderColor='yellow'
			gap={1}
		>
			{hasLayerPending && (
				<Text bold color='yellow'>
					waiting layer sequence
				</Text>
			)}
			{hasGlobalPending && (
				<Text bold color='cyan'>
					waiting global sequence
				</Text>
			)}
			{!hasLayerPending && !hasGlobalPending && (
				<Text dimColor>
					no pending sequences
				</Text>
			)}
		</Box>
	)
}

registerComponent(App, {})

render(
	<ScenarioManagementProvider defaultScreen={App} fullScreen>
		<KeyboardProvider>
			<CurrentScreen />
		</KeyboardProvider>
	</ScenarioManagementProvider>
)
