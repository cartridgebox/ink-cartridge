import { LanguageProvider } from "@cartridge-engine/i18n";
import React from "react";
import { render } from "ink-testing-library";
import { vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CurrentScreen,
	KeyboardProvider,
	ScenarioManagementProvider,
} from "ink-cartridge";
import { resources } from "../../src/utils/view/i18n-resources.js";
import { settingsStore } from "../../src/core/settings/useSettings.js";

// The tree scans its root synchronously on mount; the real persisted
// settings can point at a huge directory, so pin it to an empty temp dir.
const treeRoot = mkdtempSync(join(tmpdir(), "blots-test-tree-"));

export function stripAnsi(str: string | undefined): string {
	return (str ?? "").replace(/\x1b\[[0-9;]*m/g, "");
}

export async function flush(): Promise<void> {
	await new Promise((r) => setTimeout(r, 50));
}

export async function press(
	stdin: { write: (data: string) => void },
	key: string,
): Promise<void> {
	const { act } = await import("react");
	await act(async () => {
		stdin.write(key);
	});
}

/**
 * Render a registered screen with the full provider chain the app uses.
 *
 * `options.root` points the file tree at a specific directory (defaults to
 * the shared empty temp dir) — pass it when a test needs known tree entries.
 */
export function renderApp(
	defaultScreen: React.ComponentType,
	options?: { root?: string },
) {
	vi.spyOn(console, "warn").mockImplementation(() => {});
	settingsStore.update({
		...settingsStore.settings,
		fileTree: { root: "custom", customPath: options?.root ?? treeRoot },
	});
	return render(
		<ScenarioManagementProvider defaultScreen={defaultScreen} fullScreen>
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
	);
}
