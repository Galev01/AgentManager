import fs from "node:fs";
import path from "node:path";
import type { BrainPaths } from "./paths.js";

export type PersonChangeEvent = {
  phone: string;
  kind: "changed" | "removed";
};

type Listener = (event: PersonChangeEvent) => void;

export type BrainWatcher = {
  start(): void;
  stop(): void;
  onChange(listener: Listener): () => void;
};

function phoneFromFilename(filename: string): string | null {
  if (!filename.endsWith(".md")) return null;
  return filename.slice(0, -3);
}

export function createBrainWatcher(paths: BrainPaths): BrainWatcher {
  const listeners: Listener[] = [];
  const debounce = new Map<string, ReturnType<typeof setTimeout>>();
  let fsWatcher: fs.FSWatcher | null = null;

  function emit(event: PersonChangeEvent): void {
    for (const l of listeners) {
      try { l(event); } catch { /* ignore */ }
    }
  }

  function schedule(phone: string, kind: "changed" | "removed"): void {
    const key = `${kind}:${phone}`;
    const existing = debounce.get(key);
    if (existing) clearTimeout(existing);
    debounce.set(key, setTimeout(() => {
      debounce.delete(key);
      emit({ phone, kind });
    }, 150));
  }

  function start(): void {
    try {
      fs.mkdirSync(paths.peopleDir, { recursive: true });
    } catch {
      // ignore
    }
    try {
      fsWatcher = fs.watch(paths.peopleDir, { persistent: false }, (_event, filename) => {
        if (!filename) return;
        const name = typeof filename === "string" ? filename : String(filename);
        const phone = phoneFromFilename(name);
        if (!phone) return;
        const fullPath = path.join(paths.peopleDir, name);
        fs.access(fullPath, fs.constants.F_OK, (err) => {
          schedule(phone, err ? "removed" : "changed");
        });
      });
      fsWatcher.on("error", () => {
        // Swallow watcher errors — a dead watcher will log nothing, but we prefer that over a crashed bridge.
      });
    } catch {
      fsWatcher = null;
    }
  }

  function stop(): void {
    if (fsWatcher) {
      try { fsWatcher.close(); } catch { /* ignore */ }
      fsWatcher = null;
    }
    for (const t of debounce.values()) clearTimeout(t);
    debounce.clear();
  }

  function onChange(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  return { start, stop, onChange };
}
