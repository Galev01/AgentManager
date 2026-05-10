import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, JsonValue,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";

export type OpenclawAdapterDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

// Action ids the OpenClaw gateway exposes natively. claude-code orchestration
// is handled by the dedicated claude-code-ask service, not the gateway, so the
// adapter delegates that one back to the bridge as a no-op result; routes
// continue to call createAskOrchestrator directly until Phase D wires it
// through invokeAction. Until then, we declare claudeCode.ask supported (the
// orchestrator owns it) but the adapter itself short-circuits.
const SUPPORTED_ACTIONS: RuntimeActionId[] = [
  "agents.create", "agents.update", "agents.delete",
  "channels.connect", "channels.disconnect",
  "tools.invoke",
  "cron.write", "cron.delete",
  "claudeCode.ask",
  "sessions.send",
];

// Out of v1 scope on OpenClaw; safer to declare unsupported and add later
// than misimplement.
const UNSUPPORTED_ACTIONS: RuntimeActionId[] = [
  "memory.write", "skills.install", "config.set",
];

export function createOpenclawAdapter(cfg: AdapterConfig, deps: OpenclawAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { callGateway } = deps;

  const supported: CapabilitySnapshot["supported"] = [
    // reads
    "agents.list", "agents.read",
    "sessions.list", "sessions.read",
    "channels.list", "channels.status",
    "tools.list",
    "cron.list",
    "models.list",
    "logs.tail",
    "config.get",
    "skills.list",
    // actions
    ...SUPPORTED_ACTIONS,
  ];

  const unsupported: CapabilitySnapshot["unsupported"] = [
    "memory.query",
    ...UNSUPPORTED_ACTIONS,
  ];

  return {
    async describeRuntime() { return descriptor; },
    async getCapabilities(): Promise<CapabilitySnapshot> {
      return { supported, partial: [], unsupported, version: ADAPTER_CONTRACT_VERSION, source: "runtime-reported", stale: false };
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
    async invokeAction<A extends RuntimeActionId>(
      action: A,
      payload: RuntimeActionPayload[A],
      _context: RuntimeActionContext,
    ): Promise<RuntimeActionResult> {
      try {
        let nativeResult: unknown;
        switch (action) {
          case "agents.create": {
            nativeResult = await callGateway("agents.create", payload as Record<string, unknown>);
            break;
          }
          case "agents.update": {
            const p = payload as RuntimeActionPayload["agents.update"];
            nativeResult = await callGateway("agents.update", { name: p.name, ...p.updates });
            break;
          }
          case "agents.delete": {
            const p = payload as RuntimeActionPayload["agents.delete"];
            nativeResult = await callGateway("agents.delete", { name: p.name });
            break;
          }
          case "channels.connect": {
            nativeResult = await callGateway("channels.connect", payload as Record<string, unknown>);
            break;
          }
          case "channels.disconnect": {
            nativeResult = await callGateway("channels.disconnect", payload as Record<string, unknown>);
            break;
          }
          case "tools.invoke": {
            nativeResult = await callGateway("tools.invoke", payload as Record<string, unknown>);
            break;
          }
          case "cron.write": {
            // Gateway method historically named cron.upsert.
            nativeResult = await callGateway("cron.upsert", payload as Record<string, unknown>);
            break;
          }
          case "cron.delete": {
            nativeResult = await callGateway("cron.delete", payload as Record<string, unknown>);
            break;
          }
          case "sessions.send": {
            nativeResult = await callGateway("sessions.send", payload as Record<string, unknown>);
            break;
          }
          case "claudeCode.ask": {
            // claude-code orchestration lives in createAskOrchestrator; the
            // adapter's role here is to declare the capability and provide a
            // pass-through to the gateway-backed claudeCode bridge entry.
            // Until Phase D rewires the route, surface a structured signal so
            // callers know to keep using the orchestrator directly.
            return {
              ok: false,
              error: "claudeCode.ask routes through createAskOrchestrator until Phase D",
              projectionMode: "exact",
            };
          }
          case "memory.write":
          case "skills.install":
          case "config.set": {
            return {
              ok: false,
              error: `openclaw adapter does not support '${action}' in v1`,
              projectionMode: "exact",
            };
          }
          default: {
            // Exhaustiveness guard — every RuntimeActionId must have a case.
            const _exhaustive: never = action;
            return {
              ok: false,
              error: `unknown action '${String(_exhaustive)}'`,
              projectionMode: "exact",
            };
          }
        }
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
