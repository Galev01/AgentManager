/**
 * ZeroClaw adapter — Phase 1 stub.
 *
 * Source: https://github.com/zeroclaw-labs/zeroclaw
 *
 * Phase 1 scope: honest health + capability declaration. No write actions.
 * Trait-level introspection (providers / channel matrix / memory backends)
 * may require a Rust companion sidecar — tracked as Phase 3. Do not embed
 * Rust in-process in this Node bridge.
 *
 * Health probe is configurable via descriptor.healthPath; empty string
 * disables probe (same contract as Hermes adapter).
 */
import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, PartialCapability,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

export function createZeroclawAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const authHeader: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const partial: PartialCapability[] = [
    { id: "agents.list",     reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "channels.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "channels.status", reason: "Phase 1 stub — no channel polling",          projectionMode: "inferred", lossiness: "lossy" },
    { id: "tools.list",      reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "logs.tail",       reason: "Phase 1 stub — adapter does not fetch logs", projectionMode: "inferred", lossiness: "lossy" },
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: [],
        partial,
        unsupported: [
          // reads
          "memory.query",
          "skills.list",
          "tools.effective",
          "cron.list", "cron.status",
          "models.list",
          "agents.read", "sessions.read", "sessions.list", "sessions.usage", "config.get",
          // actions — Phase 1 has no writes.
          "agents.create", "agents.update", "agents.delete",
          "channels.connect", "channels.disconnect",
          "tools.invoke",
          "cron.write", "cron.delete", "cron.run",
          "claudeCode.ask",
          "sessions.create", "sessions.send", "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
          "memory.write",
          "skills.install",
          "config.set",
        ],
        version: ADAPTER_CONTRACT_VERSION,
        source: "static-adapter",
        stale: false,
      };
    },
    async listEntities(_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> { return []; },
    async getEntity() { return null; },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction<A extends RuntimeActionId>(
      action: A,
      _payload: RuntimeActionPayload[A],
      _context: RuntimeActionContext,
    ): Promise<RuntimeActionResult> {
      return {
        ok: false,
        error: `zeroclaw phase 1 has no '${action}' action`,
        projectionMode: "exact",
      };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Bearer", description: "ZeroClaw bearer via env ZEROCLAW_TOKEN." }];
    },
    async getExtensions() { return ["traits", "providers", "channel-matrix", "memory-backends"]; },
    async health() {
      const path = descriptor.healthPath ?? "/health";
      if (path === "") return { ok: true, detail: "probe disabled" };
      try {
        await http.json(`${base}${path}`, { method: "GET", headers: authHeader, timeoutMs });
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}
