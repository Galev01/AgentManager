import { callGateway } from "./gateway.js";
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
import type { YoutubeChatMessageRow, YoutubePromptPresetId } from "@openclaw-manager/types";
import { readSummaryWithFallback } from "./youtube-compat.js";

type Job = {
  videoId: string;
  chatSessionId: string;
  userRow: YoutubeChatMessageRow;
  assistantRowId: string;
  presetId?: YoutubePromptPresetId;
};

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

  // Session send with GC recovery
  let sessionKey: string;
  try {
    ({ key: sessionKey } = await getOrCreateSessionKey(job.videoId));
    await callGateway("sessions.send", { key: sessionKey, message: contextBlock });
  } catch (e: any) {
    if (/session not found/i.test(String(e?.message))) {
      await invalidateSessionKey(job.videoId);
      ({ key: sessionKey } = await getOrCreateSessionKey(job.videoId));
      await callGateway("sessions.send", { key: sessionKey, message: contextBlock });
    } else {
      throw e;
    }
  }

  // TODO(task-17): poll session state until terminal, tail session file,
  // extract assistant content, append assistant row with status="complete".
  // Task 17 extracts openclaw-session-tail.ts and finishes this function.
  console.warn("youtube-chat-worker: processChat scaffold — completion wiring pending (Task 17)");
}
