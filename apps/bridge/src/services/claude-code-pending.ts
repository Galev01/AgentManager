import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type {
  ClaudeCodePendingItem,
  ClaudeCodeAskResponse,
} from "@openclaw-manager/types";

type Waiter = {
  resolve: (r: ClaudeCodeAskResponse) => void;
  reject: (e: Error) => void;
};

const waiters = new Map<string, Waiter>();

async function readFileSafe(p: string): Promise<ClaudeCodePendingItem[]> {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

async function writeFileAtomic(p: string, items: ClaudeCodePendingItem[]): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify({ items }, null, 2), "utf8");
  await fs.rename(tmp, p);
}

export async function listPending(p: string): Promise<ClaudeCodePendingItem[]> {
  return readFileSafe(p);
}

export async function createPending(
  p: string,
  args: Omit<ClaudeCodePendingItem, "id" | "createdAt">
): Promise<ClaudeCodePendingItem> {
  const items = await readFileSafe(p);
  const item: ClaudeCodePendingItem = {
    ...args,
    id: `pend-${crypto.randomBytes(6).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  await writeFileAtomic(p, items);
  return item;
}

export async function resolvePending(
  p: string,
  id: string,
  result: ClaudeCodeAskResponse | { error: string }
): Promise<void> {
  const items = await readFileSafe(p);
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length !== items.length) {
    await writeFileAtomic(p, filtered);
  }
  const waiter = waiters.get(id);
  if (waiter) {
    waiters.delete(id);
    if ("error" in result) waiter.reject(new Error(result.error));
    else waiter.resolve(result);
  }
}

export function registerWaiter(
  id: string,
  resolve: (r: ClaudeCodeAskResponse) => void,
  reject: (e: Error) => void
): void {
  waiters.set(id, { resolve, reject });
}

export function unregisterWaiter(id: string): void {
  waiters.delete(id);
}

export function awaitPending(
  id: string,
  timeoutMs: number
): {
  promise: Promise<ClaudeCodeAskResponse>;
  resolve: (r: ClaudeCodeAskResponse) => void;
  reject: (e: Error) => void;
} {
  let resolve!: (r: ClaudeCodeAskResponse) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<ClaudeCodeAskResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer = setTimeout(() => {
    waiters.delete(id);
    reject(new Error("timeout"));
  }, timeoutMs);
  const wrappedResolve = (r: ClaudeCodeAskResponse) => {
    clearTimeout(timer);
    resolve(r);
  };
  const wrappedReject = (e: Error) => {
    clearTimeout(timer);
    reject(e);
  };
  return { promise, resolve: wrappedResolve, reject: wrappedReject };
}
