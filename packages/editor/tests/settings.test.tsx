import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearRegistry, registerComponent } from "ink-cartridge";
import { MainMenu } from "../src/view/page/main-menu.js";
import { Settings } from "../src/view/page/settings.js";
import { settingsStore } from "../src/core/settings/useSettings.js";
import { flush, press, renderApp, stripAnsi } from "./base/_helpers.js";

function registerAll() {
	registerComponent(MainMenu, {});
	registerComponent(Settings, {}, { parent: MainMenu });
}

describe("Settings language switching", () => {
	let tempDir = "";
	beforeEach(() => {
		clearRegistry();
		registerAll();
		// Isolate the shared settings store from the real ~/.config file.
		tempDir = mkdtempSync(join(tmpdir(), "blots-settings-test-"));
		settingsStore.reset(join(tempDir, "settings.json"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("opens a language picker modal and switches to Chinese", async () => {
		const { stdin, lastFrame, unmount } = renderApp(MainMenu);
		await flush();
		await press(stdin, "s"); // open settings
		await flush();
		// The settings screen lists the entry with its current value; the
		// language options are NOT spread out yet.
		expect(stripAnsi(lastFrame())).toContain("Language");
		expect(stripAnsi(lastFrame())).toContain("English");
		expect(stripAnsi(lastFrame())).not.toContain("中文");

		await press(stdin, "\r"); // open the language picker modal
		await flush();
		expect(stripAnsi(lastFrame())).toContain("中文");

		await press(stdin, "down"); // select 中文
		await press(stdin, "\r"); // apply + close the modal
		await flush();
		await press(stdin, "\x1b"); // back to menu
		await flush();
		expect(stripAnsi(lastFrame())).toContain("编辑模式");
		expect(stripAnsi(lastFrame())).toContain("退出");
		// The chosen language is persisted to the settings file.
		const persisted = JSON.parse(
			readFileSync(join(tempDir, "settings.json"), "utf8"),
		) as { language?: string };
		expect(persisted.language).toBe("zh");
		unmount();
	});

	it("Esc cancels the language picker without changing the language", async () => {
		const { stdin, lastFrame, unmount } = renderApp(MainMenu);
		await flush();
		await press(stdin, "s"); // open settings
		await flush();
		await press(stdin, "\r"); // open the picker
		await flush();
		await press(stdin, "down"); // select 中文…
		await press(stdin, "\x1b"); // …then cancel
		await flush();
		// Back on the settings screen, still in English.
		expect(stripAnsi(lastFrame())).toContain("English");
		expect(stripAnsi(lastFrame())).not.toContain("中文");
		unmount();
	});

	it("adjusts the cursor wheel sensitivity via the slider picker", async () => {
		const { stdin, lastFrame, unmount } = renderApp(MainMenu);
		await flush();
		await press(stdin, "s"); // open settings
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Cursor Wheel Sensitivity");

		await press(stdin, "down"); // focus the cursor-sensitivity entry
		await press(stdin, "\r"); // open its picker modal
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Click or drag to adjust");
		expect(stripAnsi(lastFrame())).toContain("1.0×");

		await press(stdin, "right"); // +0.5 step
		await flush();
		expect(stripAnsi(lastFrame())).toContain("1.5×");

		await press(stdin, "right");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("2.0×");

		await press(stdin, "left");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("1.5×");

		await press(stdin, "\x1b"); // close the picker
		await flush();
		// The settings row reflects the new value.
		expect(stripAnsi(lastFrame())).toContain("1.5×");
		unmount();
	});

	it("adjusts the render rate via the slider picker", async () => {
		const { stdin, lastFrame, unmount } = renderApp(MainMenu);
		await flush();
		await press(stdin, "s"); // open settings
		await flush();
		// Rows: language, cursor, view, file-tree-root, merge-window, fps.
		for (let i = 0; i < 5; i++) {
			await press(stdin, "down");
		}
		await flush();
		await press(stdin, "\r"); // open the fps picker modal
		await flush();
		expect(stripAnsi(lastFrame())).toContain("Render Rate (FPS)");
		expect(stripAnsi(lastFrame())).toContain("30 fps"); // the default

		await press(stdin, "right"); // +5 step
		await flush();
		expect(stripAnsi(lastFrame())).toContain("35 fps");

		await press(stdin, "left");
		await press(stdin, "left");
		await flush();
		expect(stripAnsi(lastFrame())).toContain("25 fps");

		await press(stdin, "\x1b"); // close the picker
		await flush();
		// The settings row reflects the new value.
		expect(stripAnsi(lastFrame())).toContain("25 fps");
		unmount();
	});
});
