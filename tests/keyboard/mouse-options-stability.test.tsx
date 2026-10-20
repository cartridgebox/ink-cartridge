import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import React, { act, useState } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { Mouse } from "@cartridge-engine/keyboard-engine";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
	clearDispatchers,
	ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

/** Minimal streams so enabling mouse tracking never touches the real TTY. */
class FakeStdin extends EventEmitter {
	isTTY = true;
	setEncoding() {}
	setRawMode() {}
	resume() {}
	pause() {}
	ref() {}
	unref() {}
	read() {
		return null;
	}
}

class FakeStdout extends EventEmitter {
	isTTY = true;
	columns = 80;
	rows = 24;
	write() {
		return true;
	}
}

const inputStream = new FakeStdin();
const outputStream = new FakeStdout();

let bumpApp: (() => void) | null = null;
let setThreshold: ((value: number) => void) | null = null;

function Page() {
	return <Text>page</Text>;
}

function App() {
	const [, setTick] = useState(0);
	const [threshold, setThresholdState] = useState(1);
	bumpApp = () => setTick((n) => n + 1);
	setThreshold = setThresholdState;

	return (
		<ScenarioManagementProvider defaultScreen={Page}>
			<KeyboardProvider
				mouse
				mouseOptions={{
					// A fresh closure every render — the value the key must ignore.
					setRawMode: () => {},
					clickDistanceThreshold: threshold,
					inputStream: inputStream as unknown as ReadableStreamWithEncoding,
					outputStream: outputStream as unknown as NodeJS.WriteStream,
				}}
			>
				<CurrentScreen />
			</KeyboardProvider>
		</ScenarioManagementProvider>
	);
}

let currentApp: ReturnType<typeof render> | null = null;

function renderApp() {
	currentApp = render(<App />);
	return currentApp;
}

describe("mouseOptions stability", () => {
	beforeEach(() => {
		clearRegistry();
		registerComponent(Page, {});
		// `Mouse.isSupported()` reads the process streams, not the fakes.
		Object.defineProperty(process.stdin, "isTTY", {
			value: true,
			configurable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: true,
			configurable: true,
		});
	});

	afterEach(() => {
		currentApp?.unmount();
		currentApp = null;
		clearDispatchers();
		vi.restoreAllMocks();
		delete (process.stdin as { isTTY?: boolean }).isTTY;
		delete (process.stdout as { isTTY?: boolean }).isTTY;
	});

	it("does not rebuild mouse tracking when only an inline function changes", async () => {
		const destroy = vi.spyOn(Mouse.prototype, "destroy");
		renderApp();
		await flush();
		expect(destroy).not.toHaveBeenCalled();

		const bump = bumpApp;
		const setT = setThreshold;
		if (!bump || !setT) throw new Error("App did not render");

		// A new inline `setRawMode` every render must not tear tracking down.
		await act(async () => {
			bump();
		});
		await flush();
		expect(destroy).not.toHaveBeenCalled();

		// A real option change still rebuilds the Mouse.
		await act(async () => {
			setT(2);
		});
		await flush();
		expect(destroy).toHaveBeenCalledTimes(1);

		await act(async () => {
			currentApp?.unmount();
		});
		currentApp = null;
		expect(destroy).toHaveBeenCalledTimes(2);
	});
});
