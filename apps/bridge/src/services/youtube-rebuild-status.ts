import type {
  YoutubeRebuildPart,
  YoutubeRebuildPartState,
  YoutubeRebuildPartStatus,
  YoutubeRebuildStatus,
} from "@openclaw-manager/types";

/**
 * In-memory tracker for the live progress of a `executeRebuild` call.
 *
 * The bridge runs rebuilds synchronously inside the POST request, so the
 * dashboard can't see per-part progress from the response body alone. This
 * store mirrors the in-flight state so that:
 *   - the per-video page (`RebuildMenu`) can poll for fine-grained progress;
 *   - the list page can highlight rows whose video is currently rebuilding.
 *
 * Entries linger briefly after completion (`RETAIN_AFTER_END_MS`) so the
 * final state is observable by polling clients before being garbage-collected.
 */

const RETAIN_AFTER_END_MS = 30_000;

const store = new Map<string, YoutubeRebuildStatus>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

function nowIso(): string {
  return new Date().toISOString();
}

function clearCleanupTimer(videoId: string): void {
  const t = cleanupTimers.get(videoId);
  if (t) {
    clearTimeout(t);
    cleanupTimers.delete(videoId);
  }
}

function findPart(
  status: YoutubeRebuildStatus,
  part: YoutubeRebuildPart,
): YoutubeRebuildPartState | undefined {
  return status.parts.find((p) => p.part === part);
}

/**
 * Begin tracking a rebuild for `videoId`. Initializes every part as
 * `pending`. The caller is expected to pass parts in the canonical
 * dependency-safe order from `orderRebuildParts` so the order field in the
 * UI matches execution order.
 *
 * Calling `beginRebuild` for an already-tracked video resets the entry — any
 * previous final state is discarded. Pending cleanup timers are cancelled.
 */
export function beginRebuild(
  videoId: string,
  orderedParts: YoutubeRebuildPart[],
): YoutubeRebuildStatus {
  clearCleanupTimer(videoId);
  const status: YoutubeRebuildStatus = {
    videoId,
    active: true,
    startedAt: nowIso(),
    parts: orderedParts.map<YoutubeRebuildPartState>((part) => ({
      part,
      status: "pending",
    })),
  };
  store.set(videoId, status);
  return status;
}

export function markPartRunning(videoId: string, part: YoutubeRebuildPart): void {
  const status = store.get(videoId);
  if (!status) return;
  const entry = findPart(status, part);
  if (!entry) return;
  entry.status = "running";
  entry.startedAt = nowIso();
  entry.error = undefined;
  entry.finishedAt = undefined;
}

export function markPartDone(
  videoId: string,
  part: YoutubeRebuildPart,
  status: Extract<YoutubeRebuildPartStatus, "ok" | "failed" | "skipped">,
  error?: string,
): void {
  const entry = store.get(videoId);
  if (!entry) return;
  const partEntry = findPart(entry, part);
  if (!partEntry) return;
  partEntry.status = status;
  partEntry.finishedAt = nowIso();
  if (status === "failed" || status === "skipped") {
    if (error) partEntry.error = error;
  } else {
    partEntry.error = undefined;
  }
}

/**
 * Mark the rebuild as complete. The entry is kept around for
 * `RETAIN_AFTER_END_MS` so polling clients can observe the final state, then
 * auto-deleted via `setTimeout`.
 */
export function endRebuild(videoId: string): void {
  const status = store.get(videoId);
  if (!status) return;
  status.active = false;
  status.finishedAt = nowIso();
  clearCleanupTimer(videoId);
  const timer = setTimeout(() => {
    store.delete(videoId);
    cleanupTimers.delete(videoId);
  }, RETAIN_AFTER_END_MS);
  // Don't keep the Node process alive just for retention.
  if (typeof timer.unref === "function") timer.unref();
  cleanupTimers.set(videoId, timer);
}

export function getStatus(videoId: string): YoutubeRebuildStatus | null {
  return store.get(videoId) ?? null;
}

/** Returns active rebuild entries (i.e. `active === true`). Recently-completed
 *  entries still in retention are NOT returned — list-page polling only cares
 *  about live work. */
export function listActive(): YoutubeRebuildStatus[] {
  const out: YoutubeRebuildStatus[] = [];
  for (const status of store.values()) {
    if (status.active) out.push(status);
  }
  return out;
}

/** Test/debug helper. Not exported via barrel. */
export function _resetStatusStore(): void {
  for (const t of cleanupTimers.values()) clearTimeout(t);
  cleanupTimers.clear();
  store.clear();
}
