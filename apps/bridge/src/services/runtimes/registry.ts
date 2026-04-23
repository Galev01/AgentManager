import { readFile } from "node:fs/promises";
import type { RuntimeAdapter, RuntimeDescriptor, RuntimeKind } from "@openclaw-manager/types";
import type { AdapterConfig, AdapterFactory } from "./adapter-base.js";

export type RegistryConfig = { configPath: string; factories?: Partial<Record<RuntimeKind, AdapterFactory>> };

type RegistryInternal = {
  descriptors: RuntimeDescriptor[];
  adapters: Map<string, RuntimeAdapter>;
};

function assertDescriptor(d: unknown): asserts d is RuntimeDescriptor {
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
};

export async function createRuntimeRegistry(cfg: RegistryConfig): Promise<RuntimeRegistry> {
  let raw: string;
  try { raw = await readFile(cfg.configPath, "utf8"); }
  catch (e) { throw new Error(`invalid runtime config: cannot read ${cfg.configPath}: ${(e as Error).message}`); }

  let parsed: { runtimes?: unknown };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`invalid runtime config: not valid JSON`); }

  if (!parsed.runtimes || !Array.isArray(parsed.runtimes)) throw new Error("invalid runtime config: runtimes array missing");
  parsed.runtimes.forEach(assertDescriptor);
  const descriptors = parsed.runtimes as RuntimeDescriptor[];

  const state: RegistryInternal = { descriptors, adapters: new Map() };
  const factories = cfg.factories ?? {};

  return {
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
