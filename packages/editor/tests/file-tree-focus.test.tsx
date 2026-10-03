import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render as inkRender } from "ink";
import { LanguageProvider } from "@cartridge-engine/i18n";
import {
	clearRegistry,
	CurrentScreen,
	getEngine,
	KeyboardProvider,
	registerComponent,
	ScenarioManagementProvider,
} from "ink-cartridge";
import { Editor } from "../src/view/page/editor.js";
import { settingsStore } from "../src/core/settings/useSettings.js";
import {
	EDITOR_PANE,
	paneIsActive,
	TREE_PANE,
} from "../src/view/editor/panes.js";
import { resources } from "../src/utils/view/i18n-resources.js";
import { flush, press, renderApp, stripAnsi } from "./base/_helpers.js";

// A deterministic tree: one directory (directories sort before files) then two
// files, so row 0 is `sub`, row 1 `a.md`, row 2 `b.md`.
const fixtureRoot = mkdtempSync(join(tmpdir(), "blots-tree-focus-"));
mkdirSync(join(fixtureRoot, "sub"));
writeFileSync(join(fixtureRoot, "sub", "inner.md"), "INNER");
writeFileSync(join(fixtureRoot, "a.md"), "AAA");
writeFileSync(join(fixtureRoot, "b.md"), "BBB");

// 30 files, taller than the pane's viewport (rows - 4), so keyboard navigation
// must scroll to keep the cursor visible.
const tallRoot = mkdtempSync(join(tmpdir(), "blots-tree-tall-"));
for (let i = 0; i < 30; i++) {
	writeFileSync(join(tallRoot, `f${String(i).padStart(2, "0")}.md`), `# ${i}`);
}

/** Multi-line document so the editor cursor readout (`Ln N`) can change. */
function LinesEditor() {
	return <Editor value={"L1\nL2\nL3"} />;
}

/** Empty document so opened-file content is unambiguous in the frame. */
function EmptyEditor() {
	return <Editor value={""} />;
}

/** Whether `id` is the active target of the page's "panes" focus group. */
function paneActive(screen: React.ComponentType, id: string): boolean {
	return paneIsActive(getEngine().readLayer(screen), id);
}

/** `\x1b` is the Escape key; the engine switches insert → normal. */
async function enterNormalMode(stdin: { write: (data: string) => void }) {
	await press(stdin, "\x1b");
	await flush();
}

/** Mock stdout whose size can change; `emit('resize')` drives Ink's handler. */
class ResizableStdout extends EventEmitter {
	isTTY = true;
	frames: string[] = [];
	_columns = 100;
	_rows = 30;
	get columns() {
		return this._columns;
	}
	get rows() {
		return this._rows;
	}
	write = (frame: string) => {
		this.frames.push(frame);
	};
	lastFrame = () => this.frames[this.frames.length - 1];
}

/** Minimal stdin satisfying Ink + xterm-mouse (mirrors ink-testing-library). */
class MockStdin extends EventEmitter {
	isTTY = true;
	data: string | null = null;
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
	write = (data: string) => {
		this.data = data;
		this.emit("readable");
		this.emit("data", data);
	};
}

/**
 * Render the real provider chain against a resizable stdout. The streams are
 * structurally sufficient for Ink's own useWindowSize but not full Node
 * stream instances, so they are asserted into the expected types.
 */
function renderResizable(screen: React.ComponentType, root = fixtureRoot) {
	settingsStore.update({
		...settingsStore.settings,
		fileTree: { root: "custom", customPath: root },
	});
	const stdout = new ResizableStdout();
	const stdin = new MockStdin();
	const instance = inkRender(
		<ScenarioManagementProvider defaultScreen={screen} fullScreen>
			<LanguageProvider
				resources={resources}
				defaultLanguage="en"
				fallbackLanguage="en"
			>
				<KeyboardProvider
					autoTab={false}
					mouse
					modes={["insert", "normal"]}
					defaultMode="insert"
				>
					<CurrentScreen />
				</KeyboardProvider>
			</LanguageProvider>
		</ScenarioManagementProvider>,
		{
			stdout: stdout as unknown as NodeJS.WriteStream,
			stdin: stdin as unknown as NodeJS.ReadStream,
			debug: true,
			exitOnCtrlC: false,
			patchConsole: false,
		},
	);
	return { instance, stdout, stdin };
}

async function pressRaw(stdin: MockStdin, key: string) {
	await act(async () => {
		stdin.write(key);
	});
}

describe("editor / file tree pane focus", () => {
	beforeEach(() => {
		clearRegistry();
		registerComponent(LinesEditor, {});
		registerComponent(EmptyEditor, {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("mounts with the editor pane focused", async () => {
		const { unmount } = renderApp(LinesEditor, { root: fixtureRoot });
		await flush();
		expect(paneActive(LinesEditor, EDITOR_PANE)).toBe(true);
		expect(paneActive(LinesEditor, TREE_PANE)).toBe(false);
		unmount();
	});

	it("Tab focuses the tree; its keys move the cursor and Enter opens a file", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EmptyEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab");
		await flush();
		expect(paneActive(EmptyEditor, TREE_PANE)).toBe(true);
		expect(paneActive(EmptyEditor, EDITOR_PANE)).toBe(false);

		await press(stdin, "down"); // sub → a.md
		await press(stdin, "return"); // open a.md
		await flush();
		expect(stripAnsi(lastFrame())).toContain("AAA");
		unmount();
	});

	it("the editor's keys are inert while the tree holds focus", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		expect(stripAnsi(lastFrame())).toContain("Ln 1");

		await press(stdin, "tab"); // tree focus
		await flush();
		await press(stdin, "down"); // the tree consumes it, editor stays put
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 1");

		await press(stdin, "tab"); // back to the editor
		await flush();
		await press(stdin, "down");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");
		unmount();
	});

	it("Esc returns focus to the editor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab");
		await flush();
		expect(paneActive(LinesEditor, TREE_PANE)).toBe(true);

		await press(stdin, "escape");
		await flush();
		expect(paneActive(LinesEditor, EDITOR_PANE)).toBe(true);
		await press(stdin, "down");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");
		unmount();
	});

	it("h/l collapse and expand the selected directory", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EmptyEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab"); // cursor on `sub`, collapsed
		await flush();
		expect(stripAnsi(lastFrame())).not.toContain("inner.md");

		await press(stdin, "l"); // expand
		await flush();
		expect(stripAnsi(lastFrame())).toContain("inner.md");

		await press(stdin, "l"); // redundant expand → must stay expanded
		await flush();
		expect(stripAnsi(lastFrame())).toContain("inner.md");

		await press(stdin, "h"); // collapse
		await flush();
		expect(stripAnsi(lastFrame())).not.toContain("inner.md");

		// On a file row, h/l are no-ops — they must not open the file.
		await press(stdin, "down"); // a.md
		await flush();
		await press(stdin, "l");
		await flush();
		expect(stripAnsi(lastFrame())).not.toContain("AAA");
		unmount();
	});

	it("gates the composition chain (gg) to the editor pane", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "G"); // → line 3
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 3");

		await press(stdin, "tab"); // tree focus
		await flush();
		await press(stdin, "g"); // must NOT arm the editor's gg chain
		await press(stdin, "g");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 3");

		await press(stdin, "tab"); // back to the editor
		await flush();
		await press(stdin, "g");
		await press(stdin, "g");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 1");
		unmount();
	});

	it("keyboard navigation scrolls the pane to keep the cursor visible", async () => {
		const { stdout, stdin, instance } = renderResizable(EmptyEditor, tallRoot);
		await flush();
		await pressRaw(stdin, "\x1b");
		await flush();
		await pressRaw(stdin, "tab"); // focus the tree
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("f00.md"); // top visible

		for (let i = 0; i < 29; i++) {
			await pressRaw(stdin, "down"); // to the last of the 30 files
		}
		await flush();
		const frame = stripAnsi(stdout.lastFrame());
		expect(frame).toContain("f29.md"); // the cursor row is in view
		expect(frame).not.toContain("f00.md"); // and the top scrolled off
		instance.unmount();
	});

	it("re-clamps the scroll offset when the viewport grows", async () => {
		const { stdout, stdin, instance } = renderResizable(EmptyEditor, tallRoot);
		await flush();
		await pressRaw(stdin, "\x1b");
		await flush();
		await pressRaw(stdin, "tab");
		await flush();
		for (let i = 0; i < 29; i++) {
			await pressRaw(stdin, "down"); // scroll to the bottom
		}
		await flush();
		expect(stripAnsi(stdout.lastFrame())).not.toContain("f00.md"); // scrolled off

		// A taller terminal fits every row, so the offset must reset to 0 —
		// otherwise the slice starts past the data and renders blank rows.
		stdout._rows = 60;
		await act(async () => {
			stdout.emit("resize");
		});
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("f00.md");
		instance.unmount();
	});

	it("keeps the cursor in view when the viewport shrinks", async () => {
		const { stdout, stdin, instance } = renderResizable(EmptyEditor, tallRoot);
		await flush();
		await pressRaw(stdin, "\x1b");
		await flush();
		await pressRaw(stdin, "tab");
		await flush();
		for (let i = 0; i < 29; i++) {
			await pressRaw(stdin, "down"); // cursor on the last row, scrolled down
		}
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("f29.md");

		// A shorter terminal shrinks the viewport below the cursor's row; the
		// offset must rise so the cursor row stays visible.
		stdout._rows = 10;
		await act(async () => {
			stdout.emit("resize");
		});
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("f29.md");
		instance.unmount();
	});
});
