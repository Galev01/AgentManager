import fs from "node:fs/promises";
import { config } from "../config.js";
import type { RuntimeSettingsV2 } from "@openclaw-manager/types";

const DEFAULT_SETTINGS: RuntimeSettingsV2 = {
  relayTarget: "",
  delayMs: 600000,
  summaryDelayMs: 900000,
  updatedAt: Date.now(),
  updatedBy: "system",
  relayRecipients: [],
  routingRules: [],
};

export async function readSettings(): Promise<RuntimeSettingsV2> {
  try {
    const raw = await fs.readFile(config.runtimeSettingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(updates: Partial<RuntimeSettingsV2>): Promise<RuntimeSettingsV2> {
  const current = await readSettings();
  const next: RuntimeSettingsV2 = {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  };
  const tmpPath = config.runtimeSettingsPath + ".tmp";
  await fs.writeFile(tmpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, config.runtimeSettingsPath);
  return next;
}
