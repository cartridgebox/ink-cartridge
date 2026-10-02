import { z } from "zod";

/**
 * Editor settings schema.
 *
 * This is the single source of truth for persisted user settings: extending
 * the editor with a new option means adding a field here (plus a defaults
 * entry and a UI row in the settings screen) — validation, persistence and
 * reactivity all flow from this schema.
 */

/** Wheel sensitivity in visual lines per notch, 1.0–10.0, 0.5 steps. */
export const sensitivitySchema = z
	.number()
	.min(1)
	.max(10)
	.step(0.5)
	.default(1);

/** Undo coalescing range in ms; `0` disables merging. */
export const MERGE_WINDOW_MIN = 0;
export const MERGE_WINDOW_MAX = 2000;
export const MERGE_WINDOW_STEP = 100;
export const MERGE_WINDOW_DEFAULT = 500;

/**
 * Consecutive mergeable edits closer than this (ms) collapse into one undo
 * step. `0` turns merging off, so every edit is its own step.
 */
export const mergeWindowSchema = z
	.number()
	.int()
	.min(MERGE_WINDOW_MIN)
	.max(MERGE_WINDOW_MAX)
	.multipleOf(MERGE_WINDOW_STEP)
	.default(MERGE_WINDOW_DEFAULT);

const DEFAULT_WHEEL = { cursor: 1, view: 3 } as const;

/** File-tree root source: the process startup directory or a custom path. */
export const fileTreeRootSchema = z.enum(["startup", "custom"]).default("startup");

export const settingsSchema = z.object({
	/** Persisted UI language (validated at the app layer; unknown codes fall back). */
	language: z.string().min(1).default("en"),
	wheel: z
		.object({
			/** Plain wheel: how many visual lines the CURSOR moves per notch. */
			cursor: sensitivitySchema,
			/** Ctrl+wheel: how many visual lines the VIEW scrolls per notch. */
			view: sensitivitySchema,
		})
		.default(DEFAULT_WHEEL),
	fileTree: z
		.object({
			/** Which directory the file tree scans: startup dir or `customPath`. */
			root: fileTreeRootSchema,
			/** Absolute path scanned when `root` is "custom"; ignored otherwise. */
			customPath: z.string().default(""),
		})
		.default({ root: "startup", customPath: "" }),
	history: z
		.object({
			/** Undo coalescing window in ms; see {@link mergeWindowSchema}. */
			mergeWindow: mergeWindowSchema,
		})
		.default({ mergeWindow: MERGE_WINDOW_DEFAULT }),
});

export type EditorSettings = z.infer<typeof settingsSchema>;
export type WheelSensitivity = EditorSettings["wheel"];
export type FileTreeSettings = EditorSettings["fileTree"];
export type HistorySettings = EditorSettings["history"];

export const DEFAULT_SETTINGS: EditorSettings = {
	language: "en",
	wheel: DEFAULT_WHEEL,
	fileTree: { root: "startup", customPath: "" },
	history: { mergeWindow: MERGE_WINDOW_DEFAULT },
};

/** Parse an unknown persisted value, falling back to defaults on any failure. */
export function parseSettings(raw: unknown): EditorSettings {
	const parsed = settingsSchema.safeParse(raw);
	return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
}
