import { promises as fs } from "node:fs";
import path from "node:path";

export type CronStoreEntry = {
  id: string;
  runtimeId: string;
  createdAt: number;
  agentName?: string;
};

export interface CronStore {
  remember(entry: { id: string; runtimeId: string; agentName?: string }): Promise<void>;
  lookup(id: string): Promise<CronStoreEntry | null>;
  forget(id: string): Promise<void>;
  list(): Promise<CronStoreEntry[]>;
}

export type CronStoreOptions = {
  filePath: string;
};

export function createCronStore(opts: CronStoreOptions): CronStore {
  // Load on first call, write-through on mutations.
  // Robust to missing file (initial state {}).
  let cache: Map<string, CronStoreEntry> | null = null;

  async function load(): Promise<Map<string, CronStoreEntry>> {
    if (cache) return cache;
    try {
      const raw = await fs.readFile(opts.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, CronStoreEntry>;
      cache = new Map(Object.entries(parsed));
    } catch (e: any) {
      if (e?.code !== "ENOENT") throw e;
      cache = new Map();
    }
    return cache;
  }

  async function persist(map: Map<string, CronStoreEntry>): Promise<void> {
    await fs.mkdir(path.dirname(opts.filePath), { recursive: true });
    const obj: Record<string, CronStoreEntry> = {};
    for (const [k, v] of map) obj[k] = v;
    await fs.writeFile(opts.filePath, JSON.stringify(obj, null, 2));
  }

  return {
    async remember(entry) {
      const map = await load();
      map.set(entry.id, {
        id: entry.id,
        runtimeId: entry.runtimeId,
        agentName: entry.agentName,
        createdAt: Date.now(),
      });
      await persist(map);
    },
    async lookup(id) {
      const map = await load();
      return map.get(id) ?? null;
    },
    async forget(id) {
      const map = await load();
      map.delete(id);
      await persist(map);
    },
    async list() {
      const map = await load();
      return [...map.values()];
    },
  };
}
