import fs from "node:fs/promises";
import type {
  RuntimeDescriptor, RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeStatus, FallbackReason,
} from "@openclaw-manager/types";
import { assertDescriptor } from "./runtimes/registry.js";

type FileShape = {
  configuredPrimaryRuntimeId?: string | null;
  runtimes: RuntimeDescriptor[];
};

export type RuntimeConfigServiceDeps = {
  configPath: string;
  probeStatus: (id: string) => Promise<RuntimeStatus>;
};

export type RuntimeConfigService = {
  read(): Promise<RuntimeConfigSnapshot>;
};

async function loadFile(configPath: string): Promise<FileShape> {
  let raw: string;
  try { raw = await fs.readFile(configPath, "utf8"); }
  catch (e) { throw new Error(`invalid runtime config: cannot read ${configPath}: ${(e as Error).message}`); }
  let parsed: { runtimes?: unknown; configuredPrimaryRuntimeId?: unknown };
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("invalid runtime config: not valid JSON"); }
  if (!Array.isArray(parsed.runtimes)) throw new Error("invalid runtime config: runtimes array missing");
  parsed.runtimes.forEach(assertDescriptor);
  return {
    configuredPrimaryRuntimeId:
      typeof parsed.configuredPrimaryRuntimeId === "string" ? parsed.configuredPrimaryRuntimeId :
      parsed.configuredPrimaryRuntimeId === null ? null : undefined,
    runtimes: parsed.runtimes as RuntimeDescriptor[],
  };
}

type NormalizedDescriptor = RuntimeDescriptor & { enabled: boolean };

function computeEffective(
  descriptors: NormalizedDescriptor[],
  configured: string | null | undefined,
): { effective: string | null; reason: FallbackReason | null } {
  const enabled = descriptors.filter((d) => d.enabled);
  const fallbackPick = () => {
    const oc = enabled.find((d) => d.kind === "openclaw");
    return oc?.id ?? enabled[0]?.id ?? null;
  };
  if (!configured) {
    return { effective: fallbackPick(), reason: "configured_primary_missing" };
  }
  const target = descriptors.find((d) => d.id === configured);
  if (!target) {
    return { effective: fallbackPick(), reason: "configured_primary_missing" };
  }
  if (!target.enabled) {
    return { effective: fallbackPick(), reason: "configured_primary_disabled" };
  }
  return { effective: target.id, reason: null };
}

export function createRuntimeConfigService(deps: RuntimeConfigServiceDeps): RuntimeConfigService {
  return {
    async read(): Promise<RuntimeConfigSnapshot> {
      const file = await loadFile(deps.configPath);
      const descriptors = file.runtimes.map((d) => ({ ...d, enabled: d.enabled ?? true }));

      const probed: RuntimeConfigDescriptor[] = await Promise.all(
        descriptors.map(async (d) => {
          if (!d.enabled) return { ...d, status: { state: "disabled" } as RuntimeStatus };
          const status = await deps.probeStatus(d.id);
          return { ...d, status };
        }),
      );

      const { effective, reason } = computeEffective(descriptors, file.configuredPrimaryRuntimeId);
      return {
        configuredPrimaryRuntimeId: file.configuredPrimaryRuntimeId ?? null,
        effectivePrimaryRuntimeId: effective,
        fallbackReason: reason,
        runtimes: probed,
      };
    },
  };
}
