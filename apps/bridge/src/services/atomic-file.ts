// apps/bridge/src/services/atomic-file.ts
import fs from "node:fs/promises";
import path from "node:path";

// serializes appends per filePath
const appendLocks = new Map<string, Promise<unknown>>();

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tmp, filePath);
}

export async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function appendJsonl(filePath: string, data: unknown): Promise<void> {
  const prev = appendLocks.get(filePath) ?? Promise.resolve();
  const next = prev.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(data) + "\n", "utf8");
  });
  appendLocks.set(filePath, next.catch(() => undefined));
  await next;
}
