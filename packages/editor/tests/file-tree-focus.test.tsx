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
import { setTreeFocusRequested } from "../src/view/event/subscription/tree-focus-store.js";
import { elementHasFocus } from "../src/utils/view/element-focus.js";
import { resources } from "../src/utils/view/i18n-resources.js";
import { flush, press, renderApp, stripAnsi } from "./base/_helpers.js";

/**
 * The pane's focus state as the engine sees it — via the same shared predicate
 * the component uses (including the default-group check), queried on the
 * "file-tree" layer element.
 */
function treeTargetActive(): boolean {
	return elementHasFocus(getEngine().readLayer("file-tree", "file-tree"), "file-tree");
}

// A deterministic tree: one directory (directories sort before files) then two
// files, so row 0 is `sub`, row 1 `a.md`, row 2 `b.md`.
const fixtureRoot = mkdtempSync(join(tmpdir(), "blots-tree-focus-"));
mkdirSync(join(fixtureRoot, "sub"));
writeFileSync(join(fixtureRoot, "sub", "inner.md"), "INNER");
writeFileSync(join(fixtureRoot, "a.md"), "AAA");
writeFileSync(join(fixtureRoot, "b.md"), "BBB");

/** Multi-line document so the editor cursor readout (`Ln N`) can change. */
function LinesEditor() {
	return <Editor value={"L1\nL2\nL3"} />;
}

/** Empty document so opened-file content is unambiguous in the frame. */
function EmptyEditor() {
	return <Editor value={""} />;
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
	get columns() {
		return this._columns;
	}
	get rows() {
		return 30;
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
function renderResizable(screen: React.ComponentType) {
	settingsStore.update({
		...settingsStore.settings,
		fileTree: { root: "custom", customPath: fixtureRoot },
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

describe("file tree keyboard focus", () => {
	beforeEach(() => {
		clearRegistry();
		setTreeFocusRequested(false);
		registerComponent(LinesEditor, {});
		registerComponent(EmptyEditor, {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("Tab hands the keyboard to the tree so arrows stop moving the editor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		expect(stripAnsi(lastFrame())).toContain("Ln 1");

		await press(stdin, "tab"); // focus the tree
		await flush();
		await press(stdin, "down"); // consumed by the tree, editor stays put
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 1");

		await press(stdin, "tab"); // hand focus back to the editor
		await flush();
		await press(stdin, "down");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");

		unmount();
	});

	it("without Tab the arrows still drive the editor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "down");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");
		unmount();
	});

	it("Enter opens the file under the tree cursor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EmptyEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab"); // focus the tree; cursor starts on `sub`
		await flush();
		await press(stdin, "down"); // a.md
		await press(stdin, "down"); // b.md
		await flush();
		await press(stdin, "return");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("BBB");
		unmount();
	});

	it("re-entering the tree after a round trip takes a single Tab", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EmptyEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab"); // → tree
		await flush();
		await press(stdin, "down");
		await press(stdin, "down"); // b.md
		await flush();
		await press(stdin, "return");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("BBB");

		await press(stdin, "tab"); // → editor
		await flush();
		await press(stdin, "tab"); // → tree again (single press)
		await flush();
		await press(stdin, "k"); // up → a.md
		await flush();
		await press(stdin, "return");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("AAA");
		unmount();
	});

	it("Enter expands the directory under the tree cursor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EmptyEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab"); // cursor on `sub`
		await flush();
		expect(stripAnsi(lastFrame())).not.toContain("inner.md");

		await press(stdin, "return");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("inner.md");
		unmount();
	});

	it("the pane's focus target is active only while it holds focus", async () => {
		const { stdin, unmount } = renderApp(EmptyEditor, { root: fixtureRoot });
		await flush();
		// Starts on the editor: the pane must not grab focus on mount (the
		// engine auto-activates a layer's first focus target).
		expect(treeTargetActive()).toBe(false);

		await enterNormalMode(stdin);
		await press(stdin, "tab");
		await flush();
		expect(treeTargetActive()).toBe(true);

		await press(stdin, "tab"); // back to the editor
		await flush();
		expect(treeTargetActive()).toBe(false);
		unmount();
	});

	it("Esc returns focus to the editor", async () => {
		const { stdin, lastFrame, unmount } = renderApp(LinesEditor, {
			root: fixtureRoot,
		});
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "tab"); // focus the tree
		await flush();
		expect(treeTargetActive()).toBe(true);

		// The literal "escape" reaches the engine's "escape" key name without
		// the raw `\x1b` path the repo docs flag as unreliable.
		await press(stdin, "escape");
		await flush();
		expect(treeTargetActive()).toBe(false);

		await press(stdin, "down"); // the editor owns the arrows again
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

	it("keeps the tree focused across a terminal resize", async () => {
		const { stdout, stdin, instance } = renderResizable(EmptyEditor);
		await flush();
		await pressRaw(stdin, "\x1b");
		await flush();
		await pressRaw(stdin, "tab"); // focus the tree
		await flush();
		await pressRaw(stdin, "down"); // a.md
		await flush();
		await pressRaw(stdin, "return");
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("AAA");

		// Resize the terminal — this must not drop the tree's keyboard focus.
		stdout._columns = 80;
		await act(async () => {
			stdout.emit("resize");
		});
		await flush();

		await pressRaw(stdin, "down"); // b.md (only the tree should react)
		await flush();
		await pressRaw(stdin, "return");
		await flush();
		expect(stripAnsi(stdout.lastFrame())).toContain("BBB");
		instance.unmount();
	});
});
