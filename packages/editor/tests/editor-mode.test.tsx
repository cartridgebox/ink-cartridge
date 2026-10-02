import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, registerComponent } from "ink-cartridge";
import { Editor } from "../src/view/page/editor.js";
import { settingsStore } from "../src/core/settings/useSettings.js";
import { flush, press, renderApp, stripAnsi } from "./base/_helpers.js";

/** Editor with multi-line content so cursor movement is observable. */
function EditorWithText() {
	return <Editor value={"line1\nline2\nline3"} />;
}

/** Ten lines, long enough that the column readout stays meaningful. */
function TenLines() {
	return <Editor value={Array.from({ length: 10 }, (_, i) => `line ${i} abcdef`).join("\n")} />;
}

async function enterNormalMode(stdin: { write: (data: string) => void }) {
	await press(stdin, "\x1b");
	await flush();
}

describe("Editor modes", () => {
	beforeEach(() => {
		clearRegistry();
		registerComponent(EditorWithText, {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("inserts text in insert mode", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EditorWithText);
		await flush();
		await press(stdin, "x");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("xline1");
		unmount();
	});

	it("escape switches to normal and typing is blocked", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EditorWithText);
		await flush();
		await press(stdin, "\x1b");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("NORMAL");
		await press(stdin, "xyz");
		await flush();
		expect(stripAnsi(lastFrame())).not.toContain("xyz");
		unmount();
	});

	it("normal mode moves with hjkl and arrows, and i returns to insert", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EditorWithText);
		await flush();
		await press(stdin, "\x1b"); // → normal
		await flush();
		await press(stdin, "j"); // line 2
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");
		await press(stdin, "down"); // line 3
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 3");
		await press(stdin, "k"); // back to line 2
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 2");
		await press(stdin, "i"); // → insert
		await flush();
		expect(stripAnsi(lastFrame())).toContain("INSERT");
		unmount();
	});

	it("gg via the composition engine moves to the document start", async () => {
		const { stdin, lastFrame, unmount } = renderApp(EditorWithText);
		await flush();
		await press(stdin, "\x1b"); // → normal
		await flush();
		await press(stdin, "G"); // end of document
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 3");
		await press(stdin, "g");
		await press(stdin, "g");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 1");
		unmount();
	});

	it("a count prefix moves by N lines (5j, 2k)", async () => {
		registerComponent(TenLines, {});
		const { stdin, lastFrame, unmount } = renderApp(TenLines);
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "5");
		await press(stdin, "j");
		await flush();
		// The count is swallowed, so the plain `j` binding must not add a line.
		expect(stripAnsi(lastFrame())).toContain("Ln 6");
		await press(stdin, "2");
		await press(stdin, "k");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 4");
		unmount();
	});

	it("counts accumulate over digits and clamp at both ends", async () => {
		registerComponent(TenLines, {});
		const { stdin, lastFrame, unmount } = renderApp(TenLines);
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "1");
		await press(stdin, "2");
		await press(stdin, "j");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 10");
		await press(stdin, "9");
		await press(stdin, "9");
		await press(stdin, "k");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 1");
		unmount();
	});

	it("a bare 0 still means line-start", async () => {
		registerComponent(TenLines, {});
		const { stdin, lastFrame, unmount } = renderApp(TenLines);
		await flush();
		await enterNormalMode(stdin);
		await press(stdin, "3");
		await press(stdin, "j");
		await press(stdin, "l");
		await press(stdin, "l");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 4, Col 3");
		await press(stdin, "0");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Ln 4, Col 1");
		unmount();
	});

	it("count digits stay inert in insert mode", async () => {
		registerComponent(TenLines, {});
		const { stdin, lastFrame, unmount } = renderApp(TenLines);
		await flush();
		// Still in insert mode (the default): digits must land as text, not arm
		// a count chain, so nothing moves.
		await press(stdin, "5");
		await press(stdin, "down");
		await flush();
		const frame = stripAnsi(lastFrame());
		expect(frame).toContain("5down");
		expect(frame).toContain("Ln 1");
		unmount();
	});
});

describe("Editor merge-window wiring", () => {
	/** One short line so an undone character is unambiguous in the frame. */
	function OneLine() {
		return <Editor value={"ab"} />;
	}

	let tempDir = "";
	beforeEach(() => {
		clearRegistry();
		registerComponent(OneLine, {});
		// Isolate the shared settings store from the real ~/.config file.
		tempDir = mkdtempSync(join(tmpdir(), "blots-merge-wiring-"));
		settingsStore.reset(join(tempDir, "settings.json"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("coalesces undo steps from the persisted merge window", async () => {
		// Drive the coalescing clock so the window is tested deterministically:
		// the two inserts land 700 ms apart. 700 ms is inside the configured
		// 2000 ms window, so the run shares one undo step and a single `u`
		// removes both characters ("Qab" is gone). Dropping the editor.tsx
		// wiring would leave history on its 500 ms default, where 700 ms starts a
		// new step, and one `u` would remove only the last character ("Qab"
		// survives).
		let now = 0;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		settingsStore.update({
			...settingsStore.settings,
			history: { mergeWindow: 2000 },
		});

		const { stdin, lastFrame, unmount } = renderApp(OneLine);
		await flush();
		await press(stdin, "Q");
		now = 700;
		await press(stdin, "W");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("QWab");

		await enterNormalMode(stdin);
		await press(stdin, "u");
		await flush();
		const frame = stripAnsi(lastFrame());
		expect(frame).toContain("ab");
		expect(frame).not.toContain("Qab");
		unmount();
	});
});
