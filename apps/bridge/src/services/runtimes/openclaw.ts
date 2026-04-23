import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  InvokeActionRequest, InvokeActionResult, RuntimeAuthMode, CapabilitySnapshot, JsonValue,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";

export type OpenclawAdapterDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

export function createOpenclawAdapter(cfg: AdapterConfig, deps: OpenclawAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { callGateway } = deps;

  const supported: CapabilitySnapshot["supported"] = [
    "agents.list", "agents.read",
    "sessions.list", "sessions.read", "sessions.send",
    "channels.list", "channels.status",
    "tools.list", "tools.invoke",
    "cron.list", "cron.write",
    "logs.tail",
    "config.get", "config.set",
    "skills.list", "skills.install",
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return { supported, partial: [], unsupported: ["memory.query", "memory.write"], version: ADAPTER_CONTRACT_VERSION };
    },
    async listEntities(kind: RuntimeEntityKind): Promise<RuntimeEntity[]> {
      if (kind === "agent") {
        const res = (await callGateway("agents.list")) as { agents?: Array<{ id: string; name?: string }> };
        return (res.agents ?? []).map((a) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "agent" as const, entityId: a.id, displayName: a.name ?? a.id,
          nativeRef: a as JsonValue,
        }));
      }
      if (kind === "session") {
        const res = (await callGateway("sessions.list")) as { sessions?: Array<Record<string, unknown>> };
        return (res.sessions ?? []).map((s) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "session" as const,
          entityId: String(s.key ?? s.sessionId ?? ""),
          displayName: String(s.key ?? ""),
          nativeType: String((s as { lastChannel?: string }).lastChannel ?? ""),
          lastActivityAt: typeof s.updatedAt === "number" ? (s.updatedAt as number) : undefined,
          nativeRef: s as JsonValue,
        }));
      }
      if (kind === "channel") {
        const res = (await callGateway("channels.status")) as { channels?: Array<{ id: string; status: string }> };
        return (res.channels ?? []).map((c) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "channel" as const, entityId: c.id, displayName: c.id,
          nativeType: c.status, nativeRef: c as JsonValue,
        }));
      }
      if (kind === "tool") {
        const res = (await callGateway("tools.catalog")) as { tools?: Array<{ id: string; label?: string }> };
        return (res.tools ?? []).map((t) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "tool" as const, entityId: t.id, displayName: t.label ?? t.id,
          nativeRef: t as JsonValue,
        }));
      }
      return [];
    },
    async getEntity(kind, id) {
      const list = await this.listEntities(kind);
      return list.find((e) => e.entityId === id) ?? null;
    },
    async listActivity(sinceMs, limit): Promise<RuntimeActivityEvent[]> {
      try {
        const res = (await callGateway("logs.tail", { lines: limit ?? 100 })) as { lines?: string[] };
        const lines = res.lines ?? [];
        return lines.map((line, i): RuntimeActivityEvent => ({
          runtimeKind: "openclaw", runtimeId: descriptor.id,
          eventKind: "message_out",
          at: Date.now() - (lines.length - i) * 1000,
          text: line,
          projectionMode: "inferred",
          lossiness: "lossy",
          nativeRef: { line },
        })).filter((e) => !sinceMs || e.at >= sinceMs);
      } catch { return []; }
    },
    async invokeAction(req: InvokeActionRequest): Promise<InvokeActionResult> {
      try {
        // payload is JsonValue from the contract; callGateway expects a plain
        // params record. Both are structurally JSON, the cast is safe.
        const params = req.payload as Record<string, unknown>;
        const nativeResult = await callGateway(req.action, params);
        return { ok: true, nativeResult: nativeResult as JsonValue, projectionMode: "exact" };
      } catch (e) {
        return { ok: false, error: (e as Error).message, projectionMode: "exact" };
      }
    },
    async getAuthModes(): Promise<RuntimeAuthMode[]> {
      return [{ id: "service", label: "Service principal", description: "Bridge-side OPENCLAW_GATEWAY_TOKEN." }];
    },
    async getExtensions() {
      return ["plugins", "approvals", "transcripts", "claude-code-bridge", "youtube-v2", "brain"];
    },
    async health() {
      try { await callGateway("agents.list"); return { ok: true }; }
      catch (e) { return { ok: false, detail: (e as Error).message }; }
    },
  };
}
