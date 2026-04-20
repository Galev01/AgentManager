import type { YoutubeChatMetaFile } from "@openclaw-manager/types";
import { callGateway } from "./gateway.js";
import { readChatMeta, writeChatMeta } from "./youtube-store-v2.js";
import { CHAT_SYSTEM_PROMPT } from "./youtube-prompt-presets.js";

function defaultSessionId(videoId: string): string {
  return `${videoId}-main`;
}

type CreatedSession = { key?: string; sessionId?: string; id?: string };

export async function getOrCreateSessionKey(videoId: string): Promise<{ key: string; sessionId: string }> {
  const existing = await readChatMeta(videoId);
  const chatSessionId = existing?.chatSessionId ?? defaultSessionId(videoId);

  if (existing?.openclawSessionKey) {
    return { key: existing.openclawSessionKey, sessionId: chatSessionId };
  }

  const created = (await callGateway("sessions.create", {})) as CreatedSession;
  if (!created.key) throw new Error("sessions.create did not return a key");
  const meta: YoutubeChatMetaFile = {
    videoId,
    chatSessionId,
    openclawSessionKey: created.key,
  };
  await writeChatMeta(meta);
  return { key: created.key, sessionId: chatSessionId };
}

export async function invalidateSessionKey(videoId: string): Promise<void> {
  const meta = await readChatMeta(videoId);
  if (!meta) return;
  const next: YoutubeChatMetaFile = { ...meta, openclawSessionKey: undefined };
  await writeChatMeta(next);
}

export { CHAT_SYSTEM_PROMPT };
