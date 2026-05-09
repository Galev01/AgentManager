/**
 * Hermes chat backend — Phase A2.
 *
 * Talks to the local hermes-shim over HTTP+bearer (same shim used for runtime
 * health/capabilities). Each turn dispatches `POST /v1/chat` with the bridge
 * session id; the shim runs `hermes -z <message> --continue <session_id>`,
 * which gives Hermes durable session memory in `~/.hermes/state.db`.
 */
import type {
  ChatBackendAdapter, ChatTurnRequest, ChatTurnResult, SessionBootstrap,
} from "../backend.js";
import { defaultHttp, type HttpClient } from "../../runtimes/adapter-base.js";

export type HermesChatBackendDeps = {
  endpoint: string;             // e.g. http://<hermes-host>:9119 (or http://127.0.0.1:9119 via SSH local-forward)
  bearer: string;               // HERMES_TOKEN
  http?: HttpClient;
  timeoutMs?: number;           // default 200_000 (slightly above shim's 180s)
};

function deriveKey(sessionId: string): string { return `copilot-${sessionId}`; }

export function createHermesChatBackend(deps: HermesChatBackendDeps): ChatBackendAdapter {
  const http = deps.http ?? defaultHttp;
  const base = deps.endpoint.replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${deps.bearer}` };
  const timeoutMs = deps.timeoutMs ?? 200_000;

  return {
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
