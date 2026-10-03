import { useMemo, useSyncExternalStore } from "react";
import type { EditorSettings, WheelSensitivity } from "./schema.js";
import { SettingsStore } from "./store.js";

/**
 * Shared settings store for the whole editor. One instance serves the
 * settings screen (writes) and the editor view (reads), so changes propagate
 * instantly.
 */
export const settingsStore = new SettingsStore();

export type SettingsApi = {
	settings: EditorSettings;
	/** Set a sensitivity and persist it immediately (click / keyboard). */
	setSensitivity: (key: keyof WheelSensitivity, value: number) => void;
	/** Update in memory only (while dragging); disk write happens on commit. */
	setDraft: (key: keyof WheelSensitivity, value: number) => void;
	/** Persist the in-memory settings (drag end / click). */
	commit: () => void;
	/** Persist the UI language (called alongside the i18n `setLanguage`). */
	setLanguage: (code: string) => void;
	/** Persist the file-tree root settings. */
	setFileTree: (fileTree: EditorSettings["fileTree"]) => void;
	/** Set the undo merge window (ms) and persist it immediately. */
	setMergeWindow: (ms: number) => void;
	/** Update the merge window in memory only (while dragging); commit on release. */
	setMergeWindowDraft: (ms: number) => void;
	/** Set the render rate (fps) and persist it immediately. */
	setFps: (fps: number) => void;
	/** Update the render rate in memory only (while dragging); commit on release. */
	setFpsDraft: (fps: number) => void;
};

/**
 * React binding for the shared {@link settingsStore}. Re-renders subscribers
 * whenever the store changes, keeping the editor view and the settings screen
 * in sync.
 */
export function useSettings(): SettingsApi {
	const settings = useSyncExternalStore(
		settingsStore.subscribe,
		() => settingsStore.settings,
		() => settingsStore.settings,
	);

	// Memoized per settings snapshot so the returned functions keep stable
	// identities across renders — effect deps that reference them stay calm.
	return useMemo<SettingsApi>(() => {
		const next = (key: keyof WheelSensitivity, value: number): EditorSettings => ({
			...settings,
			wheel: { ...settings.wheel, [key]: value },
		});
		return {
			settings,
			setSensitivity: (key, value) => settingsStore.persist(next(key, value)),
			setDraft: (key, value) => settingsStore.update(next(key, value)),
			commit: () => settingsStore.commit(),
			setLanguage: (code) =>
				settingsStore.persist({ ...settings, language: code }),
			setFileTree: (fileTree) =>
				settingsStore.persist({ ...settings, fileTree }),
			setMergeWindow: (ms) =>
				settingsStore.persist({
					...settings,
					history: { ...settings.history, mergeWindow: ms },
				}),
			setMergeWindowDraft: (ms) =>
				settingsStore.update({
					...settings,
					history: { ...settings.history, mergeWindow: ms },
				}),
			setFps: (fps) => settingsStore.persist({ ...settings, fps }),
			setFpsDraft: (fps) => settingsStore.update({ ...settings, fps }),
		};
	}, [settings]);
}
