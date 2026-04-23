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
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot, PartialCapability,
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
          "sessions.send", "memory.query", "memory.write",
          "skills.list", "skills.install", "tools.invoke",
          "cron.list", "cron.write", "config.set",
          "agents.read", "sessions.read", "sessions.list", "config.get",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> { return []; },
    async getEntity() { return null; },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "zeroclaw write actions not implemented in Phase 1", projectionMode: "exact" };
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
