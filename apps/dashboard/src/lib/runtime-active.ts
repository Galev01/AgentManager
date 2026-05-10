/**
 * Resolve the *active* runtime id for a server-rendered page. The URL
 * `?runtimeId=` query string takes precedence; otherwise we ask the bridge
 * for the effective primary runtime via /runtime-config so the catalog
 * pages stay back-compatible (no param → primary runtime).
 */
import { getRuntimeConfig } from "./runtime-config-client";

export async function resolveActiveRuntimeId(
  paramRuntimeId?: string | null,
): Promise<string | null> {
  if (paramRuntimeId && paramRuntimeId.trim().length > 0) return paramRuntimeId;
  try {
    const cfg = await getRuntimeConfig();
    return cfg.effectivePrimaryRuntimeId ?? null;
  } catch {
    return null;
  }
}
