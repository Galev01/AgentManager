/**
 * Hermes Agent adapter — Phase 1 stub.
 *
 * Scope: honest health probe + describe + capability snapshot. No entity
 * listing until Phase 2 grounds against real endpoints.
 *
 * Public source:
 *   https://github.com/nousresearch/hermes-agent
 *
 * Health probe path defaults to "/health" but is overridable via the
 * descriptor's healthPath field. When the runtime returns non-2xx the
 * adapter reports `ok:false` with the raw error detail; when the runtime
 * has no probe endpoint at all, configure `healthPath: ""` in
 * runtimes.json and the adapter will return `{ok:true, detail:"probe disabled"}`.
 *
 * Adapter authors: before adding new methods, fetch the README and record
 * the exact endpoint shape in this block. Do not guess endpoint paths.
 */
import type {
  RuntimeAdapter, RuntimeActivityEvent, InvokeActionRequest, InvokeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind, PartialCapability,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

export function createHermesAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const authHeader: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const partial: PartialCapability[] = [
    { id: "agents.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "sessions.list", reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "skills.list",   reason: "Phase 1 stub — no entity listing",           projectionMode: "inferred", lossiness: "lossy" },
    { id: "logs.tail",     reason: "Phase 1 stub — adapter does not fetch logs", projectionMode: "inferred", lossiness: "lossy" },
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return {
        supported: [],
        partial,
        unsupported: [
          "sessions.send", "channels.list", "channels.status",
          "memory.query", "memory.write",
          "skills.install", "tools.list", "tools.invoke",
          "cron.list", "cron.write", "config.get", "config.set",
          "agents.read", "sessions.read",
        ],
        version: ADAPTER_CONTRACT_VERSION,
      };
    },
    async listEntities(_kind: RuntimeEntityKind): Promise<RuntimeEntity[]> { return []; },
    async getEntity() { return null; },
    async listActivity(): Promise<RuntimeActivityEvent[]> { return []; },
    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return { ok: false, error: "hermes write actions not implemented in Phase 1", projectionMode: "exact" };
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Bearer", description: "Hermes bearer via env HERMES_TOKEN." }];
    },
    async getExtensions() { return ["skills-library", "scheduler", "memory", "channel-connectors"]; },
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
