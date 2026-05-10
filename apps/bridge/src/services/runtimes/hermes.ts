/**
 * Hermes Agent adapter — Phase 2 (talks to local hermes-shim over HTTP+bearer).
 *
 * The shim must be reachable at the descriptor.endpoint. Default deployment
 * tunnels Hermes's loopback shim through SSH local forward to a bridge-side
 * loopback port. See packages/hermes-shim/README.md.
 *
 * sessions.send semantics: Hermes is synchronous (/v1/chat). Both
 * awaitCompletion=true and awaitCompletion=false return the same shape
 * { assistantText, elapsedMs, sessionKey } because the runtime has no
 * async/fire-and-forget mode. Callers that request fire-and-forget
 * (awaitCompletion=false) will still receive assistantText — they may ignore it.
 */
import type {
  RuntimeAdapter, RuntimeActivityEvent,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

const STATIC_CAPS = {
  supported: ["sessions.list", "sessions.read", "skills.list", "sessions.send"] as const,
  partial: [{
    id: "logs.tail" as const,
    reason: "lines-only projection of /v1/activity",
    projectionMode: "inferred" as const,
    lossiness: "lossy" as const,
  }],
  unsupported: [
    // reads
    "channels.list", "channels.status",
    "memory.query",
    "tools.list", "tools.effective",
    "cron.list", "cron.status",
    "models.list",
    "config.get", "agents.list", "agents.read",
    "sessions.usage",
    // actions — Hermes Phase 1 has limited write capability.
    "agents.create", "agents.update", "agents.delete",
    "channels.connect", "channels.disconnect",
    "tools.invoke",
    "cron.write", "cron.delete", "cron.run",
    "claudeCode.ask",
    "sessions.create", "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
    "memory.write",
    "skills.install",
    "config.set",
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
      } catch (e) {
        console.warn("hermes: capabilities shim unreachable, using static fallback:", (e as Error).message);
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

    async invokeAction<A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      _context: RuntimeActionContext,
    ): Promise<RuntimeActionResult> {
      if (action === "sessions.send") {
        const p = payload as RuntimeActionPayload["sessions.send"];
        const started = Date.now();
        try {
          // Hermes is always synchronous — awaitCompletion=false still returns
          // the full response because /v1/chat blocks until the reply is ready.
          const res = (await http.json(`${base}/v1/chat`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: { session: p.sessionKey, message: p.message },
            timeoutMs: p.timeoutMs ?? timeoutMs ?? 120_000,
          })) as { text?: string; content?: string; assistantText?: string };
          const assistantText = res?.assistantText ?? res?.text ?? res?.content ?? "";
          const elapsedMs = Date.now() - started;
          return {
            ok: true,
            nativeResult: { assistantText, elapsedMs, sessionKey: p.sessionKey },
            projectionMode: "exact",
          };
        } catch (e) {
          return { ok: false, error: (e as Error).message ?? String(e), projectionMode: "exact" };
        }
      }
      return {
        ok: false,
        error: `hermes phase 1 has no '${action}' action`,
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
