import { EventEmitter } from "node:events";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import React, { act, useState, type ReactNode } from "react";
import { Box, Text, render as inkRender } from "ink";
import { registerComponent, clearRegistry } from "../../src/screen/registry.js";
import { clearDispatchers, ScenarioManagementProvider } from "../../src/screen/provider.js";
import { CurrentScreen } from "../../src/screen/current-screen.js";
import { KeyboardProvider } from "../../src/keyboard/provider.js";
import { useMouseRegion } from "../../src/keyboard/hook.js";
import type { ReadableStreamWithEncoding } from "@cartridge-engine/keyboard-engine";

class ResizableStdout extends EventEmitter {
	isTTY = true;
	frames: string[] = [];
	get columns() {
		return 100;
	}
	get rows() {
		return 30;
	}
	write = (frame: string) => {
		this.frames.push(frame);
	};
}

class MockStdin extends EventEmitter {
	isTTY = true;
	private data: string | Buffer | null = null;
	setEncoding() {}
	setRawMode() {}
	resume() {}
	pause() {}
	ref() {}
	unref() {}
	read = () => {
		const { data } = this;
		this.data = null;
		return data;
	};
	write = (data: string | Buffer) => {
		this.data = data;
		this.emit("readable");
		this.emit("data", data);
	};
}

async function flush(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

function lastFrameText(stdout: ResizableStdout): string {
	// eslint-disable-next-line no-control-regex
	const ansi = new RegExp("\\x1b\\[[0-9;]*m", "g");
	return (stdout.frames.at(-1) ?? "")
		.replace(ansi, "")
		.replace(/\s+/g, " ");
}

/**
 * Mirrors the editor's ModalFrame: an absolutely-positioned, draggable box
 * that forwards its `children` untouched. Because the child element reference
 * never changes, React bails out of re-rendering it when the frame moves —
 * exactly the situation that left the child region's rect stale.
 */
function Frame({ children }: { children: ReactNode }) {
	const [offset, setOffset] = useState(0);
	const [frameClicks, setFrameClicks] = useState(0);
	const frameRef = useMouseRegion({
		onClick: () => setFrameClicks((c) => c + 1),
		onDragStart: () => {},
		onDragMove: (event) => setOffset(Math.max(0, event.x - 1)),
		onDragEnd: () => {},
	});
	return (
		<Box position="absolute" left={offset} top={0} width={40} height={6}>
			<Box ref={frameRef} borderStyle="bold" width={40} height={6}>
				<Box width={10} height={1}>
					<Text>f{frameClicks}</Text>
				</Box>
				{children}
			</Box>
		</Box>
	);
}

/** The bar inside the frame — overlapping it, higher hit priority. */
function BarContent() {
	const [barClicks, setBarClicks] = useState(0);
	const barRef = useMouseRegion(
		{ onClick: () => setBarClicks((c) => c + 1) },
		{ priority: 1 },
	);
	return (
		<Box ref={barRef} width={10} height={1}>
			<Text>b{barClicks}</Text>
		</Box>
	);
}

function MovingFrameApp() {
	return <Frame children={<BarContent />} />;
}

describe("mouse region sync when an ancestor moves", () => {
	let stdout: ResizableStdout;
	let stdin: MockStdin;

	beforeEach(() => {
		clearRegistry();
		clearDispatchers();
		registerComponent(MovingFrameApp, {});
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		stdout = new ResizableStdout();
		stdin = new MockStdin();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (process.stdin as { isTTY?: boolean }).isTTY;
		delete (process.stdout as { isTTY?: boolean }).isTTY;
	});

	it("re-registers a child region's rect after an absolutely-positioned ancestor moves", async () => {
		const instance = inkRender(
			<ScenarioManagementProvider defaultScreen={MovingFrameApp} fullScreen>
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

		// offset=0: frame at cols 1..40, rows 1..6; bar at cols 12..21, row 2.
		await act(async () => {
			stdin.write("\x1b[<0;15;2M"); // press on the bar
			stdin.write("\x1b[<0;15;2m"); // release
		});
		await flush();
		expect(lastFrameText(stdout)).toContain("f0 b1");

		// Click inside the frame but outside the bar.
		await act(async () => {
			stdin.write("\x1b[<0;30;4M");
			stdin.write("\x1b[<0;30;4m");
		});
		await flush();
		expect(lastFrameText(stdout)).toContain("f1 b1");

		// Drag the frame by its top border: press at (30,1), move to (55,1).
		// The frame lands with its left edge at col 55, the bar at cols 66..75.
		await act(async () => {
			stdin.write("\x1b[<0;30;1M"); // press frame border
			stdin.write("\x1b[<32;55;1M"); // drag
			stdin.write("\x1b[<0;55;1m"); // release
		});
		await flush();

		// Click at the bar's NEW position (70,2). With the fix the child rect
		// followed the move and wins (priority 1); without it the stale rect
		// misses and the frame (updated rect) swallows the click.
		await act(async () => {
			stdin.write("\x1b[<0;70;2M");
			stdin.write("\x1b[<0;70;2m");
		});
		await flush();
		expect(lastFrameText(stdout)).toContain("f1 b2");

		instance.unmount();
		instance.cleanup();
	});
});
