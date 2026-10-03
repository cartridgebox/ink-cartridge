import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS, parseSettings } from "../src/core/settings/schema.js";
import { SettingsStore } from "../src/core/settings/store.js";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "blots-settings-"));
}

describe("settings schema", () => {
	it("accepts valid settings", () => {
		expect(
			parseSettings({ wheel: { cursor: 2.5, view: 7 } }).wheel,
		).toEqual({ cursor: 2.5, view: 7 });
		expect(parseSettings({ language: "zh" }).language).toBe("zh");
	});

	it("rejects values outside 1..10", () => {
		expect(parseSettings({ wheel: { cursor: 0, view: 1 } })).toEqual(
			DEFAULT_SETTINGS,
		);
		expect(parseSettings({ wheel: { cursor: 1, view: 12 } })).toEqual(
			DEFAULT_SETTINGS,
		);
	});

	it("rejects non-0.5 steps", () => {
		expect(
			parseSettings({ wheel: { cursor: 1.3, view: 1 } }),
		).toEqual(DEFAULT_SETTINGS);
	});

	it("accepts a valid merge window and defaults it", () => {
		expect(parseSettings({}).history.mergeWindow).toBe(500);
		expect(
			parseSettings({ history: { mergeWindow: 0 } }).history.mergeWindow,
		).toBe(0);
		expect(
			parseSettings({ history: { mergeWindow: 1200 } }).history.mergeWindow,
		).toBe(1200);
	});

	it("rejects an out-of-range or off-step merge window", () => {
		// 2500 exceeds the max; 150 is not a 100 step; both fall back wholesale.
		expect(
			parseSettings({ history: { mergeWindow: 2500 } }),
		).toEqual(DEFAULT_SETTINGS);
		expect(
			parseSettings({ history: { mergeWindow: 150 } }),
		).toEqual(DEFAULT_SETTINGS);
	});

	it("accepts a valid render rate and defaults it", () => {
		expect(parseSettings({}).fps).toBe(30);
		expect(parseSettings({ fps: 5 }).fps).toBe(5);
		expect(parseSettings({ fps: 120 }).fps).toBe(120);
	});

	it("rejects an out-of-range or off-step render rate", () => {
		// 200 exceeds the max; 12 is not a 5 step; both fall back wholesale.
		expect(parseSettings({ fps: 200 })).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings({ fps: 12 })).toEqual(DEFAULT_SETTINGS);
	});

	it("rejects missing keys", () => {
		expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
		expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
	});
});

describe("SettingsStore", () => {
	let dir = "";
	afterEach(() => {
		if (dir) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	const file = () => join(dir, "settings.json");

	it("falls back to defaults when the file is missing", () => {
		dir = tempDir();
		const store = new SettingsStore(file());
		expect(store.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("loads persisted settings", () => {
		dir = tempDir();
		writeFileSync(
			file(),
			JSON.stringify({ wheel: { cursor: 5, view: 2 }, fps: 60 }),
			"utf8",
		);
		const store = new SettingsStore(file());
		expect(store.settings.wheel).toEqual({ cursor: 5, view: 2 });
		// The `settings` getter hydrates synchronously, so the boot-time
		// `maxFps: settingsStore.settings.fps` reads the persisted value.
		expect(store.settings.fps).toBe(60);
	});

	it("falls back to defaults on corrupt JSON", () => {
		dir = tempDir();
		writeFileSync(file(), "{not json", "utf8");
		const store = new SettingsStore(file());
		expect(store.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("falls back to defaults on schema-invalid content", () => {
		dir = tempDir();
		writeFileSync(file(), JSON.stringify({ wheel: { cursor: 99, view: 1 } }), "utf8");
		const store = new SettingsStore(file());
		expect(store.settings).toEqual(DEFAULT_SETTINGS);
	});

	it("persist writes JSON to disk and update does not", () => {
		dir = tempDir();
		const store = new SettingsStore(file());
		store.update({
			...DEFAULT_SETTINGS,
			language: "zh",
			wheel: { cursor: 4, view: 4 },
		});
		expect(() => readFileSync(file(), "utf8")).toThrow(); // not written yet
		store.commit();
		expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({
			language: "zh",
			wheel: { cursor: 4, view: 4 },
			fileTree: { root: "startup", customPath: "" },
			history: { mergeWindow: 500 },
			fps: 30,
		});
	});

	it("notifies subscribers on update/persist", () => {
		dir = tempDir();
		const store = new SettingsStore(file());
		let calls = 0;
		const unsub = store.subscribe(() => calls++);
		store.update({ ...DEFAULT_SETTINGS, wheel: { cursor: 2, view: 2 } });
		expect(calls).toBe(1);
		store.persist({ ...DEFAULT_SETTINGS, wheel: { cursor: 3, view: 3 } });
		expect(calls).toBe(2);
		unsub();
		store.update({ ...DEFAULT_SETTINGS, wheel: { cursor: 1, view: 1 } });
		expect(calls).toBe(2);
	});
});
