/**
 * Hermes chat backend — Phase A2.
 *
 * Talks to the local hermes-shim over HTTP+bearer (same shim used for runtime
 * health/capabilities). Each turn dispatches `POST /v1/chat` with the bridge
 * session id; the shim runs `hermes -z <message> --continue <session_id>`,
 * which gives Hermes durable session memory in `~/.hermes/state.db`.
 *
 * Hermes is optional: when `null` (or an empty `baseUrl`) is passed in, the
 * factory returns a disabled adapter that surfaces `available: false` plus a
 * reason. The orchestrator/router are expected to short-circuit on
 * `!backend.available` so the bridge can boot without `HERMES_BASE_URL`.
 */
import type {
  ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap,
} from "../backend.js";
import { defaultHttp, type HttpClient } from "../../runtimes/adapter-base.js";

/**
 * Canonical config shape introduced for Hermes-optional support.
 */
export type HermesBackendConfig = {
  baseUrl: string;
  token: string | null;
  http?: HttpClient;
  timeoutMs?: number;
};

/**
 * Legacy config shape kept for backward compatibility with existing call sites
 * and tests (`endpoint`/`bearer`). New callers should use `HermesBackendConfig`.
 */
export type HermesChatBackendDeps = {
  endpoint: string;
  bearer: string;
  http?: HttpClient;
  timeoutMs?: number;
};

export type HermesBackend = ChatBackendAdapter & {
  available: boolean;
  reason?: string;
};

function deriveKey(sessionId: string): string { return `copilot-${sessionId}`; }

function normalize(
  cfg: HermesBackendConfig | HermesChatBackendDeps,
): { baseUrl: string; token: string; http?: HttpClient; timeoutMs?: number } {
  if ("baseUrl" in cfg) {
    return {
      baseUrl: cfg.baseUrl,
      token: cfg.token ?? "",
      http: cfg.http,
      timeoutMs: cfg.timeoutMs,
    };
  }
  return {
    baseUrl: cfg.endpoint,
    token: cfg.bearer ?? "",
    http: cfg.http,
    timeoutMs: cfg.timeoutMs,
  };
}

export function createHermesChatBackend(
  cfg: HermesBackendConfig | HermesChatBackendDeps | null,
): HermesBackend {
  if (!cfg) {
    return makeDisabled("HERMES_BASE_URL is not set; Hermes copilot backend is disabled");
  }
  const norm = normalize(cfg);
  if (!norm.baseUrl || norm.baseUrl.length === 0) {
    return makeDisabled("HERMES_BASE_URL is not set; Hermes copilot backend is disabled");
  }

  const http = norm.http ?? defaultHttp;
  const base = norm.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${norm.token}` };
  const timeoutMs = norm.timeoutMs ?? 200_000;

  return {
    available: true,
    async createSession({ sessionId }): Promise<SessionBootstrap> {
      // No backend-side bootstrap needed: Hermes lazily creates the named
      // session on first `--continue <name>` call. The bridge's session id
      // (with "copilot-" prefix to namespace) is what Hermes will track.
      return { openclawSessionKey: deriveKey(sessionId) };
    },
    async sendTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
      const key = req.session.openclawSessionKey ?? deriveKey(req.session.id);
      try {
        const result = (await http.json(`${base}/v1/chat`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: { session_id: key, message: req.userMessageText },
          timeoutMs,
        })) as { ok?: boolean; assistant_text?: string; error?: string };
        if (!result?.ok || typeof result.assistant_text !== "string") {
          return { ok: false, error: result?.error ?? "hermes shim returned no assistant text" };
        }
        return { ok: true, assistantText: result.assistant_text };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

function makeDisabled(reason: string): HermesBackend {
  return {
    available: false,
    reason,
    async createSession(): Promise<SessionBootstrap> {
      throw new Error(reason);
    },
    async sendTurn(): Promise<ChatTurnResult> {
      return { ok: false, error: reason };
    },
  };
}
