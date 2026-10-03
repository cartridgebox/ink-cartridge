#!/usr/bin/env node
import { render } from "ink";
import React from "react";
import { LanguageProvider } from "@cartridge-engine/i18n";
import {
  CurrentScreen,
  KeyboardProvider,
  registerComponent,
  ScenarioManagementProvider,
} from "ink-cartridge";
import { resources } from "./utils/view/i18n-resources.js";
import { settingsStore } from "./core/settings/useSettings.js";
import { MainMenu } from "./view/page/main-menu.js";
import { Editor } from "./view/page/editor.js";
import { Settings } from "./view/page/settings.js";

registerComponent(MainMenu, {});
registerComponent(Editor, {}, { parent: MainMenu });
registerComponent(Settings, {}, { parent: MainMenu });

render(
  <ScenarioManagementProvider defaultScreen={MainMenu} fullScreen>
    <LanguageProvider
      resources={resources}
      defaultLanguage={settingsStore.settings.language}
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
  </ScenarioManagementProvider>, {
	// Ink reads the render rate once, at construction — a settings change
	// takes effect on the next launch.
	maxFps: settingsStore.settings.fps
});
