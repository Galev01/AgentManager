import fs from "node:fs/promises";
import path from "node:path";
import type { GlobalBrain, GlobalBrainUpdate } from "@openclaw-manager/types";
import type { BrainPaths } from "./paths.js";
import { parseGlobalBrain, serializeGlobalBrain, applyGlobalUpdate } from "./global-schema.js";

export type GlobalBrainClient = {
  paths: BrainPaths;
  ensureLayout(): Promise<void>;
  get(): Promise<GlobalBrain>;
  update(update: GlobalBrainUpdate): Promise<GlobalBrain>;
};

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, filePath);
}

function emptyBrain(): GlobalBrain {
  return {
    persona: "",
    hardRules: [],
    globalFacts: [],
    toneStyle: "",
    doNotSay: [],
    defaultGoals: [],
    parseWarning: null,
    updatedAt: null,
  };
}

export function createGlobalBrainClient(paths: BrainPaths): GlobalBrainClient {
  async function ensureLayout(): Promise<void> {
    await fs.mkdir(paths.brainDir, { recursive: true });
  }

  async function get(): Promise<GlobalBrain> {
    try {
      const raw = await fs.readFile(paths.globalBrainFile, "utf8");
      return parseGlobalBrain(raw);
    } catch (err: any) {
      if (err && err.code === "ENOENT") return emptyBrain();
      throw err;
    }
  }

  async function update(upd: GlobalBrainUpdate): Promise<GlobalBrain> {
    await ensureLayout();
    const current = await get();
    const merged = applyGlobalUpdate(current, upd);
    const now = new Date().toISOString();
    const content = serializeGlobalBrain(merged, now);
    await atomicWrite(paths.globalBrainFile, content);
    return { ...merged, parseWarning: null, updatedAt: now };
  }

  return { paths, ensureLayout, get, update };
}
