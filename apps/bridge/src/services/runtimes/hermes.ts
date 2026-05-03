/**
 * Hermes Agent adapter — Phase 2 (talks to local hermes-shim over HTTP+bearer).
 *
 * The shim must be reachable at the descriptor.endpoint. Default deployment
 * tunnels Hermes's loopback shim through SSH local forward to a bridge-side
 * loopback port. See packages/hermes-shim/README.md.
 */
import type {
  RuntimeAdapter, RuntimeActivityEvent, InvokeActionRequest, InvokeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

const STATIC_CAPS = {
  supported: ["sessions.list", "sessions.read", "skills.list"] as const,
  partial: [{
    id: "logs.tail" as const,
    reason: "lines-only projection of /v1/activity",
    projectionMode: "inferred" as const,
    lossiness: "lossy" as const,
  }],
  unsupported: [
    "sessions.send", "channels.list", "channels.status",
    "memory.query", "memory.write", "skills.install",
    "tools.list", "tools.invoke", "cron.list", "cron.write",
    "config.get", "config.set", "agents.list", "agents.read",
  ] as const,
};

export function createHermesAdapter(cfg: AdapterConfig): RuntimeAdapter {
  const { descriptor, bearer, timeoutMs } = cfg;
  const http = cfg.http ?? defaultHttp;
  const base = descriptor.endpoint.replace(/\/$/, "");
  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};

  const get = (path: string, t = timeoutMs ?? 5000) =>
    http.json(`${base}${path}`, { method: "GET", headers, timeoutMs: t });

  return {
    async describeRuntime() { return descriptor; },

    async getCapabilities(): Promise<CapabilitySnapshot> {
      try {
        const live = await get("/v1/capabilities") as any;
        return {
          supported: live.supported ?? [],
          partial: live.partial ?? [],
          unsupported: live.unsupported ?? [],
          version: ADAPTER_CONTRACT_VERSION,
          source: "runtime-reported",
          stale: false,
        };
      } catch {
        return {
          supported: [...STATIC_CAPS.supported],
          partial: [...STATIC_CAPS.partial],
          unsupported: [...STATIC_CAPS.unsupported],
          version: ADAPTER_CONTRACT_VERSION,
          source: "static-adapter",
          stale: true,
        };
      }
    },

    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind === "session") {
        const rows = (await get("/v1/sessions")) as any[];
        return rows.map((r) => ({
          runtimeKind: "hermes",
          runtimeId: descriptor.id,
          entityKind: "session",
          entityId: String(r.id),
          displayName: String(r.name ?? r.id),
          lastActivityAt: r.lastActivityAt,
          nativeRef: r,
        }));
      }
      if (kind === "skill") {
        const rows = (await get("/v1/skills")) as any[];
        return rows.map((r) => ({
          runtimeKind: "hermes",
          runtimeId: descriptor.id,
          entityKind: "skill",
          entityId: String(r.id ?? r.name),
          displayName: String(r.name ?? r.id),
          nativeRef: r,
        }));
      }
      return [];
    },

    async getEntity(kind, id) {
      if (kind !== "session") return null;
      const r = (await get(`/v1/sessions/${encodeURIComponent(id)}`, 8000)) as any;
      return {
        runtimeKind: "hermes",
        runtimeId: descriptor.id,
        entityKind: "session",
        entityId: String(r.id),
        displayName: String(r.name ?? r.id),
        nativeRef: r,
      };
    },

    async listActivity(sinceMs?, limit?): Promise<RuntimeActivityEvent[]> {
      const qs = new URLSearchParams();
      if (sinceMs != null) qs.set("since", String(sinceMs));
      if (limit != null) qs.set("limit", String(limit));
      const path = `/v1/activity${qs.toString() ? `?${qs}` : ""}`;
      const rows = (await get(path)) as any[];
      return rows.map((r) => ({
        runtimeKind: "hermes",
        runtimeId: descriptor.id,
        eventKind: r.kind ?? "message_in",
        at: Number(r.at ?? Date.now()),
        entityId: r.entityId,
        text: r.text,
        projectionMode: "inferred",
        lossiness: "lossy",
        nativeRef: r,
      }));
    },

    async invokeAction(_req: InvokeActionRequest): Promise<InvokeActionResult> {
      return {
        ok: false,
        error: "hermes phase 1 has no write actions",
        projectionMode: "exact",
      };
    },

    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{
        id: "service",
        label: "Bearer (shim)",
        description: "Bearer via env HERMES_TOKEN; shim verifies HERMES_SHIM_TOKEN.",
      }];
    },

    async getExtensions() { return ["sessions", "skills", "activity"]; },

    async health() {
      try {
        const r = (await get("/v1/health")) as any;
        return r?.ok ? { ok: true } : { ok: false, detail: "shim returned not-ok" };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}
