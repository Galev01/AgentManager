import fs from "node:fs/promises";
import type {
  RuntimeDescriptor, RuntimeConfigSnapshot, RuntimeConfigDescriptor,
  RuntimeStatus, FallbackReason, RuntimeConfigPatch,
} from "@openclaw-manager/types";
import { assertDescriptor } from "./runtimes/registry.js";

export class RuntimeConfigError extends Error {
  constructor(public code: "unknown_runtime_id" | "cannot_disable_all", message: string) {
    super(message);
  }
}

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
  patch(p: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot>;
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
  const read = async (): Promise<RuntimeConfigSnapshot> => {
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
  };

  const patch = async (input: RuntimeConfigPatch): Promise<RuntimeConfigSnapshot> => {
    const file = await loadFile(deps.configPath);
    const descriptors = file.runtimes.map((d) => ({ ...d, enabled: d.enabled ?? true }));

    // Build candidate snapshot
    const candidate = descriptors.map((d) => ({ ...d }));
    if (input.enabled) {
      for (const [id, want] of Object.entries(input.enabled)) {
        const target = candidate.find((d) => d.id === id);
        if (!target) {
          throw new RuntimeConfigError("unknown_runtime_id", `unknown runtime id: ${id}`);
        }
        target.enabled = want;
      }
    }
    const nextConfigured =
      input.configuredPrimaryRuntimeId !== undefined
        ? input.configuredPrimaryRuntimeId
        : (file.configuredPrimaryRuntimeId ?? null);
    if (nextConfigured && !candidate.find((d) => d.id === nextConfigured)) {
      throw new RuntimeConfigError("unknown_runtime_id", `unknown runtime id: ${nextConfigured}`);
    }
    if (!candidate.some((d) => d.enabled)) {
      throw new RuntimeConfigError("cannot_disable_all", "at least one runtime must remain enabled");
    }

    // Atomic write
    const out = {
      configuredPrimaryRuntimeId: nextConfigured,
      runtimes: candidate,
    };
    const tmp = deps.configPath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(out, null, 2) + "\n", "utf8");
    await fs.rename(tmp, deps.configPath);

    return read();
  };

  return { read, patch };
}
