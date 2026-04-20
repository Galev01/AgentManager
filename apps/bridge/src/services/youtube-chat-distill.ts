import { callGateway } from "./gateway.js";
import type { YoutubeChatMessageRow } from "@openclaw-manager/types";

type CreatedSession = { key?: string; sessionId?: string; id?: string };
type SessionsListEntry = { sessionId?: string; id?: string; status?: string };

const DISTILL_TIMEOUT_MS = 60_000;

export type DistillResult =
  | { ok: true; paragraph: string }
  | { ok: false; reason: "empty-input" | "session-error" | "timeout" | "no-output" | "exception" };

export async function distillOlderTurns(older: YoutubeChatMessageRow[]): Promise<DistillResult> {
  if (older.length === 0) return { ok: false, reason: "empty-input" };
  const transcript = older
    .map((r) => `${r.role.toUpperCase()}: ${r.content}`)
    .join("\n\n");

  try {
    const created = (await callGateway("sessions.create", {})) as CreatedSession;
    const key = created.key;
    const sessionId = created.sessionId || created.id;
    if (!key || !sessionId) return { ok: false, reason: "session-error" };

    const prompt = `Summarize the conversation below into ONE short paragraph (<=500 chars). Preserve key facts, decisions, and open questions. No preamble.\n\n---\n${transcript}`;
    await callGateway("sessions.send", { key, message: prompt });

    const started = Date.now();
    while (Date.now() - started < DISTILL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 3000));
      const raw = (await callGateway("sessions.list", {})) as unknown;
      const list = Array.isArray(raw)
        ? (raw as SessionsListEntry[])
        : ((raw as { sessions?: SessionsListEntry[] })?.sessions ?? []);
      const s = list.find((e) => e.sessionId === sessionId || e.id === sessionId);
      const state = (s?.status || "").toLowerCase();
      if (state === "done" || state === "completed" || state === "finished" || state === "stopped") {
        return { ok: false, reason: "no-output" };
      }
      if (state === "error" || state === "failed" || state === "aborted") {
        return { ok: false, reason: "session-error" };
      }
    }
    return { ok: false, reason: "timeout" };
  } catch {
    return { ok: false, reason: "exception" };
  }
}
