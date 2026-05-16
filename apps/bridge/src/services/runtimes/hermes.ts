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
import crypto from "node:crypto";
import type {
  RuntimeAdapter, RuntimeActivityEvent,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, RuntimeEntity, RuntimeEntityKind,
  RuntimeSessionListItem, RuntimeSessionDetail, RuntimeSessionMessage,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, defaultHttp, type AdapterConfig } from "./adapter-base.js";

const STATIC_CAPS = {
  supported: ["sessions.list", "sessions.read", "skills.list", "sessions.send", "sessions.create"] as const,
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
    "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
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
      // Capabilities the adapter implements locally, regardless of what the shim reports.
      const adapterOwned = ["sessions.create"] as const;
      try {
        const live = await get("/v1/capabilities") as any;
        const liveSupported: string[] = live.supported ?? [];
        const liveUnsupported: string[] = (live.unsupported ?? []).filter(
          (c: string) => !adapterOwned.includes(c as typeof adapterOwned[number])
        );
        return {
          supported: [...new Set([...liveSupported, ...adapterOwned])] as unknown as CapabilitySnapshot["supported"],
          partial: live.partial ?? [],
          unsupported: liveUnsupported as unknown as CapabilitySnapshot["unsupported"],
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
      if (action === "sessions.create") {
        // Hermes creates sessions implicitly on first /v1/chat call.
        // Generate a stable key; the shim initialises the session on first send.
        const key = `hermes-${crypto.randomBytes(8).toString("hex")}`;
        return { ok: true, nativeResult: { key }, projectionMode: "exact" };
      }

      if (action === "sessions.send") {
        const p = payload as RuntimeActionPayload["sessions.send"];
        const started = Date.now();
        try {
          // Hermes is always synchronous — awaitCompletion=false still returns
          // the full response because /v1/chat blocks until the reply is ready.
          const res = (await http.json(`${base}/v1/chat`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: { session_id: p.sessionKey, message: p.message },
            timeoutMs: p.timeoutMs ?? timeoutMs ?? 120_000,
          })) as {
            text?: string;
            content?: string;
            assistantText?: string;
            assistant_text?: string;
            sessionKey?: string;
            session_id?: string;
            elapsedMs?: number;
            elapsed_ms?: number;
          };
          const assistantText = res?.assistantText ?? res?.assistant_text ?? res?.text ?? res?.content ?? "";
          const elapsedMs = Date.now() - started;
          return {
            ok: true,
            nativeResult: {
              assistantText,
              elapsedMs: res?.elapsedMs ?? res?.elapsed_ms ?? elapsedMs,
              sessionKey: res?.sessionKey ?? res?.session_id ?? p.sessionKey,
            },
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

    async listSessions(): Promise<RuntimeSessionListItem[]> {
      const rows = (await get("/v1/sessions")) as Array<{
        id?: string;
        displayName?: string;
        startedAt?: number;
        lastActivityAt?: number;
        messageCount?: number;
        model?: string | null;
      }>;
      return rows.map((r) => ({
        runtimeId: descriptor.id,
        runtimeKind: "hermes" as const,
        sessionId: String(r.id ?? ""),
        displayName: String(r.displayName ?? r.id ?? ""),
        startedAt: typeof r.startedAt === "number" ? r.startedAt : undefined,
        lastActivityAt: typeof r.lastActivityAt === "number" ? r.lastActivityAt : undefined,
        messageCount: typeof r.messageCount === "number" ? r.messageCount : undefined,
        model: r.model ?? null,
        agentId: null,
      }));
    },

    async getSessionDetail(sessionId: string): Promise<RuntimeSessionDetail | null> {
      let body: any;
      try {
        body = await get(`/v1/sessions/${encodeURIComponent(sessionId)}`, 10_000);
      } catch (e) {
        // Adapter contract: return null on missing; rethrow on other errors.
        const msg = (e as Error).message ?? "";
        if (/\b404\b/.test(msg) || /not found/i.test(msg)) return null;
        throw e;
      }
      const summary = body?.summary ?? {};
      const list: RuntimeSessionListItem = {
        runtimeId: descriptor.id,
        runtimeKind: "hermes",
        sessionId: String(summary.id ?? sessionId),
        displayName: String(summary.displayName ?? summary.id ?? sessionId),
        startedAt: typeof summary.startedAt === "number" ? summary.startedAt : undefined,
        lastActivityAt: typeof summary.lastActivityAt === "number" ? summary.lastActivityAt : undefined,
        messageCount: typeof summary.messageCount === "number" ? summary.messageCount : undefined,
        model: summary.model ?? null,
        agentId: null,
      };
      const rawMessages: any[] = Array.isArray(body?.messages) ? body.messages : [];
      const messages: RuntimeSessionMessage[] = rawMessages.map((m, idx) => ({
        index: typeof m?.index === "number" ? m.index : idx,
        role: ((): RuntimeSessionMessage["role"] => {
          const r = m?.role;
          if (r === "user" || r === "assistant" || r === "system" || r === "tool") return r;
          return "unknown";
        })(),
        text: typeof m?.text === "string" ? m.text : "",
        contentType: m?.contentType ?? "text",
      }));
      return {
        list,
        systemPrompt: typeof body?.systemPrompt === "string" ? body.systemPrompt : null,
        messages,
      };
    },

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
