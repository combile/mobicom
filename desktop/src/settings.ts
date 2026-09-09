import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { NotifySettings } from "./notify-rules";

export const DEFAULT_SERVER_URL = "http://203.230.103.35:3300";

export type Settings = {
  serverUrl: string;
  notify: NotifySettings;
};

const DEFAULTS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  notify: { enabled: true, otherMessages: true, taskAssigned: true },
};

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

/**
 * Reads the settings file, filling in anything missing from defaults.
 *
 * Merged field by field rather than all-or-nothing: a file written by an older
 * version lacks whatever was added since, and losing every setting because one
 * key is absent would be worse than the file not existing at all.
 */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), "utf8")) as Partial<Settings>;
    return {
      serverUrl:
        typeof raw.serverUrl === "string" && raw.serverUrl ? raw.serverUrl : DEFAULTS.serverUrl,
      notify: { ...DEFAULTS.notify, ...(raw.notify ?? {}) },
    };
  } catch {
    // No file yet, or unreadable. Defaults are a working configuration.
    return DEFAULTS;
  }
}

export function saveSettings(next: Settings): void {
  // Called from the tray's checkbox click handler — an uncaught throw there
  // (disk full, permissions, userData path unwritable) would crash the whole
  // main process over a settings write. Log and move on instead.
  try {
    const path = settingsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    console.error("failed to save settings", err);
  }
}
