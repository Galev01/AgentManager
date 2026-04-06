import fs from "node:fs";
import { config } from "../config.js";

type ChangeCallback = (file: "state" | "events" | "settings") => void;

const listeners: ChangeCallback[] = [];

export function onFileChange(cb: ChangeCallback): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notify(file: "state" | "events" | "settings"): void {
  for (const cb of listeners) {
    try {
      cb(file);
    } catch {
      // swallow listener errors
    }
  }
}

let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function debounced(file: "state" | "events" | "settings"): void {
  if (debounceTimers[file]) clearTimeout(debounceTimers[file]);
  debounceTimers[file] = setTimeout(() => notify(file), 200);
}

export function startWatching(): void {
  try {
    fs.watch(config.openclawStatePath, () => debounced("state"));
  } catch {
    console.warn("Could not watch state file — will rely on polling");
  }

  try {
    fs.watch(config.eventsPath, () => debounced("events"));
  } catch {
    console.warn("Could not watch events file — will rely on polling");
  }

  try {
    fs.watch(config.runtimeSettingsPath, () => debounced("settings"));
  } catch {
    console.warn("Could not watch settings file — will rely on polling");
  }
}
