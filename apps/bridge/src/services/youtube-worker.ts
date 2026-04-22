import crypto from "node:crypto";
import {
  appendJobEvent,
  appendIndexEvent,
  updateJob,
  foldJobs,
  repairOnStartup as storeRepairOnStartup,
  writeMarkdown,
  buildFrontMatter,
} from "./youtube-store.js";
import { fetchCaptions, CaptionsUnavailableError, VideoNotFoundError, TranscriptTooShortError } from "./youtube-captions.js";
import { summarize } from "./youtube-summarize.js";
import { executeRebuild, orderRebuildParts } from "./youtube-rebuild.js";
import type { YoutubeJob, YoutubeRebuildPart } from "@openclaw-manager/types";

const FULL_PIPELINE_PARTS: YoutubeRebuildPart[] = orderRebuildParts([
  "captions",
  "chunks",
  "highlights",
  "chapters",
  "chat-history",
]);

type QueueItem = { job: YoutubeJob };

const queue: QueueItem[] = [];
let current: YoutubeJob | null = null;
let running = false;

export function getWorkerState(): { current: string | null; queued: string[] } {
  return {
    current: current?.videoId ?? null,
    queued: queue.map((q) => q.job.videoId),
  };
}

/**
 * Enqueue a new job. If a non-terminal job already exists for this videoId,
 * returns that existing job and does NOT create a new one.
 */
export async function submit(url: string, videoId: string): Promise<YoutubeJob> {
  // Dedup against the in-memory queue + currently-processing job.
  if (current && current.videoId === videoId) return current;
  const queuedDup = queue.find((q) => q.job.videoId === videoId);
  if (queuedDup) return queuedDup.job;

  // Also dedup against any non-terminal job persisted but not yet picked up
  // (covers the race where the bridge restarted after enqueue but before drain).
  const existing = (await foldJobs()).find(
    (j) => j.videoId === videoId && (j.status === "queued" || j.status === "processing")
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const job: YoutubeJob = {
    jobId: crypto.randomUUID(),
    videoId,
    url,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  await appendJobEvent(job);
  await appendIndexEvent({ videoId, status: "queued", meta: { url }, at: now });
  queue.push({ job });
  void drain();
  return job;
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      current = item.job;
      await process(item.job);
      current = null;
    }
  } finally {
    running = false;
  }
}

async function process(job: YoutubeJob): Promise<void> {
  let captions;
  try {
    const processing = await updateJob(job, { status: "processing" });
    job = processing;

    captions = await fetchCaptions(job.videoId);
    const summary = await summarize(captions, job.url);

    const fetchedAt = new Date().toISOString();
    const updatedAt = fetchedAt;
    const meta = {
      videoId: job.videoId,
      title: captions.title,
      channel: captions.channel,
      url: job.url,
      durationSeconds: captions.durationSeconds,
      captionLanguage: captions.language,
      fetchedAt,
      updatedAt,
    };
    const fileBody = buildFrontMatter(meta) + summary.markdown + "\n";
    await writeMarkdown(job.videoId, fileBody);

    await updateJob(job, { status: "done", meta });

    try {
      await executeRebuild({ videoId: job.videoId, url: job.url }, FULL_PIPELINE_PARTS);
    } catch (rebuildErr) {
      console.warn(
        `[youtube-worker] post-summary rebuild failed for ${job.videoId}:`,
        rebuildErr instanceof Error ? rebuildErr.message : rebuildErr
      );
    }
  } catch (err: any) {
    const msg = mapError(err);
    await updateJob(job, { status: "failed", errorMessage: msg });
  }
}

function mapError(err: unknown): string {
  if (err instanceof CaptionsUnavailableError) return err.message;
  if (err instanceof VideoNotFoundError) return err.message;
  if (err instanceof TranscriptTooShortError) return err.message;
  if (err instanceof Error) return err.message;
  return "unknown error";
}

/** Called from server.ts on startup to fail any half-done jobs from a previous crash. */
export async function repairOnStartup(): Promise<void> {
  await storeRepairOnStartup();
}

/**
 * Run the summary pipeline synchronously for a given video, bypassing the
 * FIFO queue. Used by the v2 rebuild path which needs to await completion
 * and does its own orchestration / error reporting.
 *
 * This duplicates the core steps of `process()` (fetch captions, summarize,
 * write v1 markdown) but skips the job-event log — rebuild tracks its own
 * per-part results. Errors propagate to the caller rather than being
 * swallowed into a "failed" job status.
 */
export async function runSummaryNow(videoId: string, url: string): Promise<void> {
  const captions = await fetchCaptions(videoId);
  const summary = await summarize(captions, url);
  const fetchedAt = new Date().toISOString();
  const meta = {
    videoId,
    title: captions.title,
    channel: captions.channel,
    url,
    durationSeconds: captions.durationSeconds,
    captionLanguage: captions.language,
    fetchedAt,
    updatedAt: fetchedAt,
  };
  const fileBody = buildFrontMatter(meta) + summary.markdown + "\n";
  await writeMarkdown(videoId, fileBody);
}
