import fs from "node:fs/promises";
import { config } from "../config.js";
import type { RuntimeSettings } from "@openclaw-manager/types";

const DEFAULT_SETTINGS: RuntimeSettings = {
  relayTarget: "",
  delayMs: 600000,
  summaryDelayMs: 900000,
  updatedAt: Date.now(),
  updatedBy: "system",
};

export async function readSettings(): Promise<RuntimeSettings> {
  try {
    const raw = await fs.readFile(config.runtimeSettingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(updates: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const current = await readSettings();
  const next: RuntimeSettings = {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  };
  const tmpPath = config.runtimeSettingsPath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, config.runtimeSettingsPath);
  return next;
}
