import { EventEmitter } from "node:events";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act, useState } from "react";
import { Box, Text, render as inkRender } from "ink";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import {
	clearDispatchers,
	ScenarioManagementProvider,
} from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import {
	KeyboardProvider,
} from "../../src/keyboard/provider.js";
import { useMouseRegion } from "../../src/keyboard/hook.js";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";

/** Mock stdout whose size can change; `emit('resize')` drives Ink's real handler. */
class ResizableStdout extends EventEmitter {
	isTTY = true;
	frames: string[] = [];
	_columns = 100;
	get columns() {
		return this._columns;
	}
	get rows() {
		return 30;
	}
	write = (frame: string) => {
		this.frames.push(frame);
	};
}

/** Minimal stdin satisfying Ink + xterm-mouse (EventEmitter feeds raw data). */
class MockStdin extends EventEmitter {
	isTTY = true;
	setEncoding() {}
	setRawMode() {}
	resume() {}
	pause() {}
	ref() {}
	unref() {}
	read = () => null;
	write = (data: string | Buffer) => {
		this.emit("data", data);
	};
}

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

/**
 * A horizontally-centered click target. Its rect moves when the terminal
 * width changes — exactly the stale-rect scenario reported on the editor's
 * menu screen (which has no `useBoxMetrics` of its own).
 */
function ClickTargetApp() {
	const [count, setCount] = useState(0);
	const ref = useMouseRegion({
		onClick: () => setCount((c) => c + 1),
	});
	return (
		<Box width="100%" justifyContent="center">
			<Box ref={ref} width={20} height={3}>
				<Text>clicks:{count}</Text>
			</Box>
		</Box>
	);
}

/**
 * The editor's menu layout: buttons sit inside a fixed-width centered row,
 * so a button's OWN relative metrics don't change on resize — only the
 * absolute position (ancestor offsets) does. `useBoxMetrics` alone misses
 * this; the stale rect must still be re-measured on resize.
 */
function CenteredRowButtonApp() {
	const [count, setCount] = useState(0);
	const ref = useMouseRegion({
		onClick: () => setCount((c) => c + 1),
	});
	return (
		<Box
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
			width="100%"
		>
			<Box flexDirection="row" gap={6}>
				<Box ref={ref} width={20} height={3}>
					<Text>clicks:{count}</Text>
				</Box>
			</Box>
		</Box>
	);
}

describe("mouse region resize sync", () => {
	let stdout: ResizableStdout;
	let stdin: MockStdin;

	beforeEach(() => {
		clearRegistry();
		clearDispatchers();
		registerComponent(ClickTargetApp, {});
		// xterm-mouse's support check reads process streams, not the mocks
		// passed to Ink — fake TTY so the mouse feed actually starts.
		Object.defineProperty(process.stdin, "isTTY", {
			value: true,
			configurable: true,
		});
		Object.defineProperty(process.stdout, "isTTY", {
			value: true,
			configurable: true,
		});
		stdout = new ResizableStdout();
		stdin = new MockStdin();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// Restore real TTY flags (vitest may reuse this process for other tests).
		delete (process.stdin as { isTTY?: boolean }).isTTY;
		delete (process.stdout as { isTTY?: boolean }).isTTY;
	});

	it("re-registers the region rect after a terminal resize", async () => {
		const instance = inkRender(
			<ScenarioManagementProvider defaultScreen={ClickTargetApp} fullScreen>
				<KeyboardProvider
					autoTab={false}
					mouse
					mouseOptions={{
						inputStream: stdin as unknown as ReadableStreamWithEncoding,
						outputStream: stdout as unknown as NodeJS.WriteStream,
					}}
				>
					<CurrentScreen />
				</KeyboardProvider>
			</ScenarioManagementProvider>,
			{
				stdout: stdout as unknown as NodeJS.WriteStream,
				stdin: stdin as unknown as NodeJS.ReadStream,
				debug: true,
				exitOnCtrlC: false,
				patchConsole: false,
			},
		);

		await flush();

		// 100-col terminal: the 20-wide target sits at columns 41..60 (1-based).
		await act(async () => {
			stdin.write("\x1b[<0;50;2M"); // press at x=50
			stdin.write("\x1b[<0;50;2m"); // release at x=50
		});
		await flush();
		expect(stdout.frames.join("")).toContain("clicks:1");

		// Shrink to 60 cols: the target recenters to columns 21..40.
		stdout._columns = 60;
		stdout.emit("resize");
		await flush();

		// Click at the target's new center (x=30). A stale pre-resize rect
		// (41..60) would miss this hit entirely.
		await act(async () => {
			stdin.write("\x1b[<0;30;2M");
			stdin.write("\x1b[<0;30;2m");
		});
		await flush();
		expect(stdout.frames.join("")).toContain("clicks:2");

		// Grow back to 100 cols: the target recenters to 41..60 again.
		stdout._columns = 100;
		stdout.emit("resize");
		await flush();
		await act(async () => {
			stdin.write("\x1b[<0;50;2M");
			stdin.write("\x1b[<0;50;2m");
		});
		await flush();
		expect(stdout.frames.join("")).toContain("clicks:3");

		instance.unmount();
		instance.cleanup();
	});

	it("re-registers a fixed-width centered-row target after resize (menu-button layout)", async () => {
		registerComponent(CenteredRowButtonApp, {});
		const instance = inkRender(
			<ScenarioManagementProvider
				defaultScreen={CenteredRowButtonApp}
				fullScreen
			>
				<KeyboardProvider
					autoTab={false}
					mouse
					mouseOptions={{
						inputStream: stdin as unknown as ReadableStreamWithEncoding,
						outputStream: stdout as unknown as NodeJS.WriteStream,
					}}
				>
					<CurrentScreen />
				</KeyboardProvider>
			</ScenarioManagementProvider>,
			{
				stdout: stdout as unknown as NodeJS.WriteStream,
				stdin: stdin as unknown as NodeJS.ReadStream,
				debug: true,
				exitOnCtrlC: false,
				patchConsole: false,
			},
		);

		await flush();

		// 100-col terminal: the 20-wide centered row sits at columns 41..60.
		await act(async () => {
			stdin.write("\x1b[<0;50;2M");
			stdin.write("\x1b[<0;50;2m");
		});
		await flush();
		expect(stdout.frames.join("")).toContain("clicks:1");

		// Shrink to 60 cols: the row recenters to columns 21..40, but the
		// button's own relative metrics (inside the row) stay identical, so
		// `useBoxMetrics` alone sees no change.
		stdout._columns = 60;
		stdout.emit("resize");
		await flush();

		// Click at the new center (x=30). The stale pre-resize rect (41..60)
		// would miss this hit entirely.
		await act(async () => {
			stdin.write("\x1b[<0;30;2M");
			stdin.write("\x1b[<0;30;2m");
		});
		await flush();
		expect(stdout.frames.join("")).toContain("clicks:2");

		instance.unmount();
		instance.cleanup();
	});
});
