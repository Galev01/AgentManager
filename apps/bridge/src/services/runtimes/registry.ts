import { readFile, stat } from "node:fs/promises";
import type { RuntimeAdapter, RuntimeDescriptor, RuntimeKind } from "@openclaw-manager/types";
import type { AdapterConfig, AdapterFactory } from "./adapter-base.js";

export type RegistryConfig = {
  /** Single explicit path. Mutually compatible with `configPaths`. */
  configPath?: string;
  /**
   * Ordered candidate paths; the first one that exists wins. Manager-owned
   * paths are listed before legacy plugin-owned ones.
   */
  configPaths?: string[];
  factories?: Partial<Record<RuntimeKind, AdapterFactory>>;
};

type RegistryInternal = {
  descriptors: RuntimeDescriptor[];
  adapters: Map<string, RuntimeAdapter>;
};

export function assertDescriptor(d: unknown): asserts d is RuntimeDescriptor {
  const o = d as Record<string, unknown>;
  if (!o || typeof o.id !== "string" || typeof o.kind !== "string"
    || typeof o.displayName !== "string" || typeof o.endpoint !== "string"
    || typeof o.transport !== "string" || typeof o.authMode !== "string") {
    throw new Error("invalid runtime config: missing required descriptor field");
  }
  if (!["openclaw", "hermes", "zeroclaw", "nanobot"].includes(o.kind as string)) {
    throw new Error(`invalid runtime config: unknown kind '${o.kind}'`);
  }
}

export type RuntimeRegistry = {
  list(): Promise<RuntimeDescriptor[]>;
  get(id: string): Promise<RuntimeDescriptor | null>;
  adapter(id: string): Promise<RuntimeAdapter | null>;
  /** Path the registry actually loaded from. Useful for downstream services
   *  (e.g. runtime-config) that need to write back to the same file. */
  configPath(): string;
};

async function pickConfigPath(cfg: RegistryConfig): Promise<string> {
  const candidates: string[] = [];
  if (cfg.configPath) candidates.push(cfg.configPath);
  if (cfg.configPaths) candidates.push(...cfg.configPaths);
  if (candidates.length === 0) {
    throw new Error("invalid runtime config: no configPath/configPaths provided");
  }
  const tried: string[] = [];
  for (const p of candidates) {
    tried.push(p);
    try {
      const s = await stat(p);
      if (s.isFile()) return p;
    } catch {
      // not present, try next
    }
  }
  // Fall back to the first candidate so the readFile error surfaces a sensible
  // path instead of "no candidates".
  throw new Error(
    `invalid runtime config: no readable file found. Tried: ${tried.join(", ")}`,
  );
}

export async function createRuntimeRegistry(cfg: RegistryConfig): Promise<RuntimeRegistry> {
  const chosen = await pickConfigPath(cfg);
  // eslint-disable-next-line no-console
  console.log(`runtime-registry: loaded ${chosen}`);
  let raw: string;
  try { raw = await readFile(chosen, "utf8"); }
  catch (e) { throw new Error(`invalid runtime config: cannot read ${chosen}: ${(e as Error).message}`); }

  let parsed: { runtimes?: unknown };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`invalid runtime config: not valid JSON`); }

  if (!parsed.runtimes || !Array.isArray(parsed.runtimes)) throw new Error("invalid runtime config: runtimes array missing");
  parsed.runtimes.forEach(assertDescriptor);
  const descriptors: RuntimeDescriptor[] = (parsed.runtimes as RuntimeDescriptor[]).map((d) => ({
    ...d,
    enabled: d.enabled ?? true,
  }));

  const state: RegistryInternal = { descriptors, adapters: new Map() };
  const factories = cfg.factories ?? {};

  return {
    configPath() { return chosen; },
    async list() { return [...state.descriptors]; },
    async get(id) { return state.descriptors.find((d) => d.id === id) ?? null; },
    async adapter(id) {
      if (state.adapters.has(id)) return state.adapters.get(id)!;
      const d = state.descriptors.find((x) => x.id === id);
      if (!d) return null;
      const f = factories[d.kind];
      if (!f) return null;
      const adapterCfg: AdapterConfig = { descriptor: d, timeoutMs: 5000 };
      const a = f(adapterCfg);
      state.adapters.set(id, a);
      return a;
    },
  };
}
