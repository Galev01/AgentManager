import type { YoutubeChatMetaFile, ActorAssertionRef } from "@openclaw-manager/types";
import { readChatMeta, writeChatMeta } from "./youtube-store-v2.js";
import { CHAT_SYSTEM_PROMPT } from "./youtube-prompt-presets.js";
import type { RuntimeRegistry } from "./runtimes/registry.js";
import type { RuntimeConfigService } from "./runtime-config.js";

function defaultSessionId(videoId: string): string {
  return `${videoId}-main`;
}

export type GetOrCreateSessionDeps = {
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
  preferredRuntimeId?: string;     // explicit override; default: meta.runtimeId, then primary
  preferredAgentName?: string;
  actor: ActorAssertionRef;
};

export async function getOrCreateSessionKey(
  videoId: string,
  deps: GetOrCreateSessionDeps,
): Promise<{ key: string; sessionId: string; runtimeId: string; agentName?: string }> {
  const existing = await readChatMeta(videoId);
  const chatSessionId = existing?.chatSessionId ?? defaultSessionId(videoId);

  // Existing session: prefer runtimeSessionKey; fall back to openclawSessionKey for back-compat.
  const existingKey = existing?.runtimeSessionKey ?? existing?.openclawSessionKey;
  if (existingKey && existing?.runtimeId) {
    return {
      key: existingKey,
      sessionId: chatSessionId,
      runtimeId: existing.runtimeId,
      agentName: existing.agentName,
    };
  }
  if (existingKey && !existing?.runtimeId) {
    // Pre-existing session before this migration: assume openclaw primary.
    const snap = await deps.runtimeConfig.read();
    const primary = snap.effectivePrimaryRuntimeId;
    if (!primary) throw new Error("no runtime available for legacy session");
    return { key: existingKey, sessionId: chatSessionId, runtimeId: primary };
  }

  // No existing session: create one via the resolved runtime.
  const snap = await deps.runtimeConfig.read();
  const runtimeId =
    deps.preferredRuntimeId ?? snap.effectivePrimaryRuntimeId;
  if (!runtimeId) throw new Error("no runtime available to create youtube chat session");
  const adapter = await deps.registry.adapter(runtimeId);
  if (!adapter) throw new Error(`runtime '${runtimeId}' has no adapter`);

  const result = await adapter.invokeAction(
    "sessions.create",
    { agentName: deps.preferredAgentName },
    { actor: deps.actor },
  );
  if (!result.ok) {
    throw new Error(`sessions.create failed on '${runtimeId}': ${result.error}`);
  }
  const native = (result.nativeResult ?? {}) as Record<string, unknown>;
  const key =
    (typeof native.key === "string" && native.key) ||
    (typeof native.sessionKey === "string" && native.sessionKey) ||
    (typeof native.id === "string" && native.id) ||
    null;
  if (!key) throw new Error(`sessions.create on '${runtimeId}' did not return a key`);

  const meta: YoutubeChatMetaFile = {
    videoId,
    chatSessionId,
    runtimeSessionKey: key,
    openclawSessionKey: key,    // back-compat mirror
    runtimeId,
    agentName: deps.preferredAgentName,
  };
  await writeChatMeta(meta);

  return { key, sessionId: chatSessionId, runtimeId, agentName: deps.preferredAgentName };
}

export async function invalidateSessionKey(videoId: string): Promise<void> {
  const meta = await readChatMeta(videoId);
  if (!meta) return;
  const next: YoutubeChatMetaFile = {
    ...meta,
    runtimeSessionKey: undefined,
    openclawSessionKey: undefined,
  };
  await writeChatMeta(next);
}

export { CHAT_SYSTEM_PROMPT };
