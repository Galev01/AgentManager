import type {
  RuntimeAdapter, RuntimeEntity, RuntimeEntityKind, RuntimeActivityEvent,
  RuntimeActionId, RuntimeActionPayload, RuntimeActionContext, RuntimeActionResult,
  RuntimeAuthMode, CapabilitySnapshot, JsonValue, RuntimeReadCapabilityId,
  RuntimeSessionListItem, RuntimeSessionDetail, RuntimeSessionMessage,
} from "@openclaw-manager/types";
import { ADAPTER_CONTRACT_VERSION, type AdapterConfig } from "./adapter-base.js";
import {
  waitForSessionTerminal,
  sessionFilePath,
  readLastAssistantMessage,
} from "../openclaw-session-tail.js";

export type OpenclawAdapterDeps = {
  callGateway: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  /** Optional DI for session-tail helpers (used in tests to avoid fs/timer deps). */
  waitForSessionTerminal?: typeof waitForSessionTerminal;
  sessionFilePath?: typeof sessionFilePath;
  readLastAssistantMessage?: typeof readLastAssistantMessage;
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
  "cron.write", "cron.delete", "cron.run",
  "claudeCode.ask",
  "sessions.create", "sessions.send", "sessions.reset", "sessions.abort", "sessions.compact", "sessions.delete",
];

// Out of v1 scope on OpenClaw; safer to declare unsupported and add later
// than misimplement.
const UNSUPPORTED_ACTIONS: RuntimeActionId[] = [
  "memory.write", "skills.install", "config.set",
];

export function createOpenclawAdapter(cfg: AdapterConfig, deps: OpenclawAdapterDeps): RuntimeAdapter {
  const { descriptor } = cfg;
  const { callGateway } = deps;

  // Allow DI of session-tail helpers for tests, fall back to real imports.
  const _waitForSessionTerminal = deps.waitForSessionTerminal ?? waitForSessionTerminal;
  const _sessionFilePath = deps.sessionFilePath ?? sessionFilePath;
  const _readLastAssistantMessage = deps.readLastAssistantMessage ?? readLastAssistantMessage;

  const supported: CapabilitySnapshot["supported"] = [
    // reads
    "agents.list", "agents.read",
    "sessions.list", "sessions.read", "sessions.usage",
    "channels.list", "channels.status",
    "tools.list", "tools.effective",
    "cron.list", "cron.status",
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

  async function wrapGw(method: string, params: Record<string, unknown>): Promise<RuntimeActionResult> {
    try {
      const raw = await callGateway(method, params);
      return { ok: true, nativeResult: (raw as JsonValue) ?? null, projectionMode: "exact" };
    } catch (e) {
      return { ok: false, error: (e as Error).message ?? String(e), projectionMode: "exact" };
    }
  }

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
        // Gateway returns { channels: { <id>: <entry> }, channelOrder?: string[] }.
        // Flatten into one entity per channel id, preserving the native entry as
        // nativeRef so route projection can recover full status fields.
        const res = (await callGateway("channels.status")) as {
          channels?: Record<string, Record<string, unknown>>;
          channelOrder?: string[];
        };
        const channels = res?.channels ?? {};
        const order = Array.isArray(res?.channelOrder) && res.channelOrder.length
          ? res.channelOrder
          : Object.keys(channels);
        return order.map((id) => {
          const entry = (channels[id] ?? {}) as Record<string, unknown>;
          const lastError = entry.lastError;
          const connected = entry.connected;
          const status = lastError ? "error" : connected === true ? "connected" : "disconnected";
          const lastActivityAt = typeof entry.lastEventAt === "number"
            ? (entry.lastEventAt as number)
            : typeof entry.lastConnectedAt === "number"
              ? (entry.lastConnectedAt as number)
              : undefined;
          return {
            runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
            entityKind: "channel" as const,
            entityId: id,
            displayName: id,
            nativeType: status,
            lastActivityAt,
            nativeRef: { ...entry, status, id } as JsonValue,
          };
        });
      }
      if (kind === "tool") {
        const res = (await callGateway("tools.catalog")) as { tools?: Array<{ id: string; label?: string }> };
        return (res.tools ?? []).map((t) => ({
          runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
          entityKind: "tool" as const, entityId: t.id, displayName: t.label ?? t.id,
          nativeRef: t as JsonValue,
        }));
      }
      if (kind === "cron") {
        const res = (await callGateway("cron.list")) as { jobs?: Array<{ id?: string; name?: string }> } | Array<Record<string, unknown>>;
        const rows = Array.isArray(res) ? res : (res?.jobs ?? []);
        return rows.map((r) => {
          const rec = r as Record<string, unknown>;
          const id = String(rec.id ?? rec.name ?? "");
          return {
            runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
            entityKind: "cron" as const,
            entityId: id,
            displayName: String(rec.name ?? id),
            nativeRef: rec as JsonValue,
          };
        });
      }
      if (kind === "model") {
        const res = (await callGateway("models.list")) as { models?: Array<Record<string, unknown>> };
        return (res?.models ?? []).map((m) => {
          const id = String(m.id ?? m.key ?? "");
          const label = (typeof m.displayName === "string" && m.displayName)
            || (typeof m.name === "string" && m.name)
            || id;
          return {
            runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
            entityKind: "model" as const,
            entityId: id,
            displayName: label,
            nativeRef: m as JsonValue,
          };
        });
      }
      return [];
    },
    async getEntity(kind, id) {
      if (kind === "agent") {
        try {
          const identity = (await callGateway("agents.identity", { name: id })) as Record<string, unknown> | null;
          if (!identity || typeof identity !== "object") return null;
          const entityId = String(identity.id ?? identity.name ?? id);
          const displayName = String(identity.name ?? entityId);
          return {
            runtimeKind: "openclaw" as const, runtimeId: descriptor.id,
            entityKind: "agent" as const, entityId, displayName,
            nativeRef: identity as JsonValue,
          };
        } catch {
          return null;
        }
      }
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
            // OpenClaw gateway has no `channels.connect` method today; channel
            // sessions auto-establish on first message. We pass through to
            // `channels.connect` for symmetry with future gateway support and
            // forward the typed payload's `channelId` as the legacy `channel`
            // param the gateway uses elsewhere.
            const p = payload as RuntimeActionPayload["channels.connect"];
            const params: Record<string, unknown> = { channel: p.channelId };
            if (p.config !== undefined) params.config = p.config;
            nativeResult = await callGateway("channels.connect", params);
            break;
          }
          case "channels.disconnect": {
            // Maps the typed `channels.disconnect` action to the legacy gateway
            // method `channels.logout` (single existing implementation), and
            // renames the `channelId` payload field to `channel`.
            const p = payload as RuntimeActionPayload["channels.disconnect"];
            nativeResult = await callGateway("channels.logout", { channel: p.channelId });
            break;
          }
          case "tools.invoke": {
            nativeResult = await callGateway("tools.invoke", payload as Record<string, unknown>);
            break;
          }
          case "cron.write": {
            // Gateway method historically named cron.add (upsert when id present).
            // Translate the typed { id?, spec: { cron, payload, enabled } } shape
            // back to the legacy gateway shape { id?, schedule, command?, agent?, name?, enabled? }.
            const p = payload as RuntimeActionPayload["cron.write"];
            const pl = (p.spec.payload ?? null) as Record<string, unknown> | null;
            const gwParams: Record<string, unknown> = {
              schedule: p.spec.cron,
              enabled: p.spec.enabled,
            };
            if (typeof p.id === "string" && p.id) gwParams.id = p.id;
            if (pl && typeof pl.command === "string") gwParams.command = pl.command;
            if (pl && typeof pl.agent === "string")   gwParams.agent   = pl.agent;
            if (pl && typeof pl.name === "string")    gwParams.name    = pl.name;
            const method = typeof p.id === "string" && p.id ? "cron.upsert" : "cron.add";
            nativeResult = await callGateway(method, gwParams);
            break;
          }
          case "cron.delete": {
            nativeResult = await callGateway("cron.delete", payload as Record<string, unknown>);
            break;
          }
          case "cron.run": {
            const p = payload as RuntimeActionPayload["cron.run"];
            return wrapGw("cron.run", { id: p.id });
          }
          case "sessions.create": {
            const p = payload as RuntimeActionPayload["sessions.create"];
            const params: Record<string, unknown> = {};
            if (typeof p.agentName === "string" && p.agentName.trim()) {
              params.agent = p.agentName.trim();
            }
            return wrapGw("sessions.create", params);
          }
          case "sessions.send": {
            const p = payload as RuntimeActionPayload["sessions.send"];
            if (p.awaitCompletion) {
              const started = Date.now();
              const timeoutMs = p.timeoutMs ?? 120_000;
              // Fire the send.
              await callGateway("sessions.send", { key: p.sessionKey, message: p.message });
              // Resolve the sessionId from sessions.list.
              const listRaw = (await callGateway("sessions.list", {})) as unknown;
              const sessions = Array.isArray(listRaw)
                ? (listRaw as Array<Record<string, unknown>>)
                : ((listRaw as { sessions?: Array<Record<string, unknown>> })?.sessions ?? []);
              const entry = sessions.find(
                (s) => s.key === p.sessionKey || s.sessionKey === p.sessionKey,
              );
              if (!entry) {
                return { ok: false, error: `session '${p.sessionKey}' not found after send`, projectionMode: "exact" };
              }
              const sessionId = String(entry.sessionId ?? entry.id ?? p.sessionKey);
              // Wait for terminal status; on timeout attempt abort.
              try {
                await _waitForSessionTerminal(sessionId, timeoutMs, async () => {
                  try { await callGateway("sessions.abort", { key: p.sessionKey }); } catch { /* best-effort */ }
                });
              } catch (e) {
                return { ok: false, error: (e as Error).message ?? String(e), projectionMode: "exact" };
              }
              const sessionFile = _sessionFilePath(entry as Parameters<typeof _sessionFilePath>[0], sessionId);
              const content = await _readLastAssistantMessage(sessionFile);
              if (!content) {
                return { ok: false, error: `no assistant output in ${sessionFile}`, projectionMode: "exact" };
              }
              const elapsedMs = Date.now() - started;
              return {
                ok: true,
                nativeResult: { assistantText: content.trim(), elapsedMs, sessionKey: p.sessionKey },
                projectionMode: "exact",
              };
            }
            // Fire-and-forget (existing behaviour).
            nativeResult = await callGateway("sessions.send", payload as Record<string, unknown>);
            break;
          }
          case "sessions.reset": {
            const p = payload as RuntimeActionPayload["sessions.reset"];
            return wrapGw("sessions.reset", { session: p.sessionKey });
          }
          case "sessions.abort": {
            const p = payload as RuntimeActionPayload["sessions.abort"];
            return wrapGw("sessions.abort", { session: p.sessionKey });
          }
          case "sessions.compact": {
            const p = payload as RuntimeActionPayload["sessions.compact"];
            return wrapGw("sessions.compact", { session: p.sessionKey });
          }
          case "sessions.delete": {
            const p = payload as RuntimeActionPayload["sessions.delete"];
            return wrapGw("sessions.delete", { session: p.sessionKey });
          }
          case "claudeCode.ask": {
            // claude-code orchestration owns transcript/pending/operator-approval
            // (bridge cross-cutting concerns). The adapter's job is the agent
            // dispatch step: ensure the gateway session exists, send the user
            // turn, poll for the assistant reply, return the assistant text.
            const p = payload as RuntimeActionPayload["claudeCode.ask"];
            const gatewayKey = p.gatewayKey;
            if (!gatewayKey) {
              return {
                ok: false,
                error: "openclaw claudeCode.ask requires payload.gatewayKey",
                projectionMode: "exact",
              };
            }
            // Ensure the gateway session exists, snapshot baseline length so
            // we know when our reply lands. Mirrors the legacy orchestrator.
            try {
              await callGateway("sessions.create", { key: gatewayKey });
            } catch (e) {
              return {
                ok: false,
                error: `sessions.create failed: ${(e as Error).message}`,
                projectionMode: "exact",
              };
            }
            const baselineState = (await callGateway("sessions.get", {
              key: gatewayKey,
            })) as { messages?: Array<{ role?: string }> };
            const baselineLength = baselineState?.messages?.length ?? 0;
            const messageToSend =
              baselineLength === 0 && typeof p.firstTurnMessage === "string"
                ? p.firstTurnMessage
                : p.question;
            try {
              await callGateway("sessions.send", {
                key: gatewayKey,
                idempotencyKey: p.msgId,
                message: messageToSend,
              });
            } catch (e) {
              return {
                ok: false,
                error: `sessions.send failed: ${(e as Error).message}`,
                projectionMode: "exact",
              };
            }
            // Poll until the assistant turn appears.
            const intervalMs = p.replyPollIntervalMs ?? 500;
            const timeoutMs = p.replyTimeoutMs ?? 120_000;
            const deadline = Date.now() + timeoutMs;
            let assistantText: string | null = null;
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, intervalMs));
              const state = (await callGateway("sessions.get", {
                key: gatewayKey,
              })) as {
                messages?: Array<{
                  role?: string;
                  content?: Array<{ type?: string; text?: string }>;
                }>;
              };
              const messages = state?.messages ?? [];
              if (messages.length >= baselineLength + 2) {
                const last = messages[messages.length - 1];
                if (last && last.role === "assistant") {
                  const part = last.content?.find(
                    (c) => c.type === "text" && typeof c.text === "string",
                  );
                  if (part?.text) {
                    assistantText = part.text;
                    break;
                  }
                }
              }
            }
            if (assistantText === null) {
              return {
                ok: false,
                error: "timeout waiting for OpenClaw reply",
                projectionMode: "exact",
              };
            }
            return {
              ok: true,
              nativeResult: {
                assistantText,
                gatewayKey,
                msgId: p.msgId,
              } as JsonValue,
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
    async listSessions(): Promise<RuntimeSessionListItem[]> {
      const res = (await callGateway("sessions.list")) as {
        sessions?: Array<Record<string, unknown>>;
      };
      const rows = res?.sessions ?? [];
      return rows.map((s) => {
        const key = String(s.key ?? s.sessionId ?? "");
        const agentName = typeof s.agentName === "string"
          ? s.agentName
          : typeof s.agentId === "string"
            ? s.agentId
            : null;
        return {
          runtimeId: descriptor.id,
          runtimeKind: "openclaw" as const,
          sessionId: key,
          displayName: key,
          lastActivityAt: typeof s.updatedAt === "number" ? (s.updatedAt as number) : undefined,
          messageCount: typeof s.messageCount === "number" ? (s.messageCount as number) : undefined,
          model: typeof s.model === "string" ? (s.model as string) : null,
          agentId: agentName,
        };
      });
    },
    async getSessionDetail(sessionId: string): Promise<RuntimeSessionDetail | null> {
      let state: any;
      try {
        state = await callGateway("sessions.get", { key: sessionId });
      } catch {
        return null;
      }
      if (!state || typeof state !== "object") return null;
      const rawMessages: any[] = Array.isArray(state.messages) ? state.messages : [];
      let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheCreate = 0;
      let lastModel: string | null = null;
      const messages: RuntimeSessionMessage[] = rawMessages.map((m, idx) => {
        const role = m?.role;
        const normalizedRole: RuntimeSessionMessage["role"] =
          role === "user" || role === "assistant" || role === "system" || role === "tool"
            ? role
            : "unknown";
        let text = "";
        if (typeof m?.content === "string") {
          text = m.content;
        } else if (Array.isArray(m?.content)) {
          text = m.content
            .map((c: any) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : ""))
            .filter(Boolean)
            .join("\n");
        }
        const usage = m?.usage ?? {};
        if (normalizedRole === "assistant") {
          totalInput += Number(usage.input_tokens ?? 0);
          totalOutput += Number(usage.output_tokens ?? 0);
          totalCacheRead += Number(usage.cache_read_input_tokens ?? 0);
          totalCacheCreate += Number(usage.cache_creation_input_tokens ?? 0);
          if (typeof m?.model === "string") lastModel = m.model;
        }
        return {
          index: idx,
          role: normalizedRole,
          text,
          contentType: "text",
          model: typeof m?.model === "string" ? m.model : undefined,
          usage: usage && typeof usage === "object" ? {
            inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
            outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
            cacheReadTokens: typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : undefined,
            cacheCreateTokens: typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : undefined,
          } : undefined,
        };
      });
      const list: RuntimeSessionListItem = {
        runtimeId: descriptor.id,
        runtimeKind: "openclaw",
        sessionId,
        displayName: sessionId,
        messageCount: messages.length,
        model: lastModel ?? (typeof state.model === "string" ? state.model : null),
        agentId: null,
      };
      return {
        list,
        systemPrompt: typeof state.systemPrompt === "string" ? state.systemPrompt : null,
        messages,
        totals: {
          inputTokens: totalInput,
          outputTokens: totalOutput,
          cacheReadTokens: totalCacheRead,
          cacheCreateTokens: totalCacheCreate,
        },
      };
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
    async read(capabilityId: RuntimeReadCapabilityId, params?: JsonValue): Promise<JsonValue> {
      const p = (params ?? {}) as Record<string, unknown>;
      switch (capabilityId) {
        case "sessions.usage": {
          const sessionKey = String(p.sessionKey ?? "");
          if (!sessionKey) throw new Error("sessions.usage requires sessionKey");
          return (await callGateway("sessions.usage", { session: sessionKey })) as JsonValue;
        }
        case "cron.status": {
          const id = String(p.id ?? "");
          if (!id) throw new Error("cron.status requires id");
          return (await callGateway("cron.status", { id })) as JsonValue;
        }
        case "tools.effective": {
          return (await callGateway("tools.effective", {})) as JsonValue;
        }
        default:
          throw new Error(`OpenClaw adapter.read: unsupported capability ${capabilityId}`);
      }
    },
  };
}
