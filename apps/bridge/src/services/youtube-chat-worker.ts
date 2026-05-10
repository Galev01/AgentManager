import {
  appendChatRow,
  foldChatLog,
  readChunks,
  readMetadata,
  readSummaryV2,
} from "./youtube-store-v2.js";
import { loadOrBuildIndex } from "./youtube-retrieval-index.js";
import { searchIndex } from "./youtube-retrieve.js";
import { buildReplayContext } from "./youtube-chat-replay.js";
import { getOrCreateSessionKey, invalidateSessionKey, CHAT_SYSTEM_PROMPT } from "./youtube-chat-session.js";
import { PROMPT_PRESETS } from "./youtube-prompt-presets.js";
import type { YoutubeChatMessageRow, YoutubePromptPresetId, ActorAssertionRef } from "@openclaw-manager/types";
import { readSummaryWithFallback } from "./youtube-compat.js";
import type { RuntimeRegistry } from "./runtimes/registry.js";
import type { RuntimeConfigService } from "./runtime-config.js";

type Job = {
  videoId: string;
  chatSessionId: string;
  userRow: YoutubeChatMessageRow;
  assistantRowId: string;
  presetId?: YoutubePromptPresetId;
  runtimeId?: string;
  agentName?: string;
};

type WorkerDeps = {
  registry: RuntimeRegistry;
  runtimeConfig: RuntimeConfigService;
};

const SYSTEM_ACTOR: ActorAssertionRef = {
  humanActorUserId: "system",
  managerServiceId: "bridge",
  basis: "service-principal",
};

let workerDeps: WorkerDeps | null = null;

export function configureYoutubeChatWorker(deps: WorkerDeps): void {
  workerDeps = deps;
}

const queue: Job[] = [];
const locks = new Set<string>();
let running = false;

function lockKey(videoId: string, chatSessionId: string): string {
  return `${videoId}:${chatSessionId}`;
}

export function enqueueChatJob(job: Job): boolean {
  const k = lockKey(job.videoId, job.chatSessionId);
  if (locks.has(k) && queue.some((j) => lockKey(j.videoId, j.chatSessionId) === k)) return false;
  queue.push(job);
  void drain();
  return true;
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const k = lockKey(job.videoId, job.chatSessionId);
      if (locks.has(k)) {
        queue.push(job);
        continue;
      }
      locks.add(k);
      try {
        await processChat(job);
      } catch (e: any) {
        const errorRow: YoutubeChatMessageRow = {
          id: job.assistantRowId,
          videoId: job.videoId,
          chatSessionId: job.chatSessionId,
          turnId: job.userRow.turnId,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          status: "error",
          errorMessage: e?.message || "chat failed",
          parentMessageId: job.userRow.id,
        };
        await appendChatRow(errorRow);
      } finally {
        locks.delete(k);
      }
    }
  } finally {
    running = false;
  }
}

async function processChat(job: Job): Promise<void> {
  if (!workerDeps) {
    throw new Error("youtube-chat-worker not configured (call configureYoutubeChatWorker at boot)");
  }
  const { registry, runtimeConfig } = workerDeps;

  // Build context
  const [meta, summaryLoaded, chunksFile, history] = await Promise.all([
    readMetadata(job.videoId),
    (async () => (await readSummaryV2(job.videoId)) ?? (await readSummaryWithFallback(job.videoId))?.markdown ?? "")(),
    readChunks(job.videoId),
    foldChatLog(job.videoId),
  ]);
  const summary = typeof summaryLoaded === "string" ? summaryLoaded : "";
  const ms = await loadOrBuildIndex(job.videoId, chunksFile);
  const retrieved = ms ? searchIndex(ms, job.userRow.content, 6) : [];

  const isFirstTurn = history.filter((r) => r.role === "assistant" && r.status === "complete").length === 0;
  const preset = job.presetId ? PROMPT_PRESETS[job.presetId] : undefined;
  const retrievedBlock = retrieved.length
    ? "Retrieved transcript chunks:\n" +
      retrieved.map((c) => `[${Math.floor(c.start)}s] ${c.text}`).join("\n\n")
    : "";

  const contextBlock = isFirstTurn
    ? [
        CHAT_SYSTEM_PROMPT,
        "",
        "---",
        "",
        await buildReplayContext(summary, history.filter((r) => r.id !== job.userRow.id)),
        "",
        retrievedBlock,
        "",
        preset ? `Preset: ${preset.chatInstructions}` : "",
        "",
        `USER: ${job.userRow.content}`,
      ].join("\n")
    : [
        retrievedBlock,
        "",
        `USER: ${job.userRow.content}`,
      ].join("\n");

  // Resolve session via runtime adapter
  const sess = await getOrCreateSessionKey(job.videoId, {
    registry,
    runtimeConfig,
    preferredRuntimeId: job.runtimeId,
    preferredAgentName: job.agentName,
    actor: SYSTEM_ACTOR,
  });
  const adapter = await registry.adapter(sess.runtimeId);
  if (!adapter) throw new Error(`runtime '${sess.runtimeId}' has no adapter`);

  // Send with awaitCompletion; GC recovery on "session not found"
  let sendResult = await adapter.invokeAction(
    "sessions.send",
    { sessionKey: sess.key, message: contextBlock, awaitCompletion: true, timeoutMs: 120_000 },
    { actor: SYSTEM_ACTOR },
  );

  if (!sendResult.ok && /session not found/i.test(sendResult.error)) {
    await invalidateSessionKey(job.videoId);
    const sess2 = await getOrCreateSessionKey(job.videoId, {
      registry,
      runtimeConfig,
      preferredRuntimeId: job.runtimeId,
      preferredAgentName: job.agentName,
      actor: SYSTEM_ACTOR,
    });
    sendResult = await adapter.invokeAction(
      "sessions.send",
      { sessionKey: sess2.key, message: contextBlock, awaitCompletion: true, timeoutMs: 120_000 },
      { actor: SYSTEM_ACTOR },
    );
  }

  if (!sendResult.ok) throw new Error(sendResult.error);

  const native = (sendResult.nativeResult ?? {}) as Record<string, unknown>;
  const assistantText = typeof native.assistantText === "string" ? native.assistantText.trim() : "";
  if (!assistantText) throw new Error(`empty assistantText from ${sess.runtimeId}`);

  const assistantRow: YoutubeChatMessageRow = {
    id: job.assistantRowId,
    videoId: job.videoId,
    chatSessionId: job.chatSessionId,
    turnId: job.userRow.turnId,
    role: "assistant",
    content: assistantText,
    createdAt: new Date().toISOString(),
    status: "complete",
    runtimeId: sess.runtimeId,
    runtimeSessionKey: sess.key,
    openclawSessionKey: sess.key,    // back-compat mirror
    parentMessageId: job.userRow.id,
    retrievedChunkIds: retrieved.map((r) => r.id),
  };
  await appendChatRow(assistantRow);
}
