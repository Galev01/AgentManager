import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type {
  YoutubeJob,
  YoutubeJobStatus,
  YoutubeIndexEvent,
  YoutubeSummaryListItem,
  YoutubeSummaryMeta,
} from "@openclaw-manager/types";

// Internal event type — extends the public one with a "deleted" sentinel
// used by deleteSummary(). Kept private so the public surface stays clean.
type StoredIndexEvent = YoutubeIndexEvent | {
  videoId: string;
  status: "deleted";
  at: string;
};

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.youtubeSummariesDir, { recursive: true });
}

async function readJsonl<T>(filepath: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filepath, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines — surfaced in console for diagnosis
      console.warn(`youtube-store: skipping malformed line in ${filepath}`);
    }
  }
  return out;
}

async function appendJsonl(filepath: string, obj: unknown): Promise<void> {
  await ensureDir();
  await fs.appendFile(filepath, JSON.stringify(obj) + "\n", "utf8");
}

// ---------- Jobs ----------

export async function readJobs(): Promise<YoutubeJob[]> {
  return readJsonl<YoutubeJob>(config.youtubeJobsPath);
}

/** Returns current state of every job by jobId — folded from the append-only log. */
export async function foldJobs(): Promise<YoutubeJob[]> {
  const events = await readJobs();
  const byId = new Map<string, YoutubeJob>();
  for (const ev of events) {
    const prev = byId.get(ev.jobId);
    byId.set(ev.jobId, prev ? { ...prev, ...ev } : ev);
  }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function activeJobs(): Promise<YoutubeJob[]> {
  const all = await foldJobs();
  return all.filter((j) => j.status === "queued" || j.status === "processing");
}

export async function appendJobEvent(job: YoutubeJob): Promise<void> {
  await appendJsonl(config.youtubeJobsPath, job);
}

// ---------- Index ----------

export async function readIndex(): Promise<StoredIndexEvent[]> {
  return readJsonl<StoredIndexEvent>(config.youtubeIndexPath);
}

export async function appendIndexEvent(ev: StoredIndexEvent): Promise<void> {
  await appendJsonl(config.youtubeIndexPath, ev);
}

/**
 * Pure: collapses an event log into one row per videoId. Sorted by latest
 * activity descending. A "deleted" event removes the entry entirely.
 * Re-runs after a failure clear errorMessage when a newer non-failed event arrives.
 */
export function foldIndexEvents(events: StoredIndexEvent[]): YoutubeSummaryListItem[] {
  const byId = new Map<string, { item: YoutubeSummaryListItem; lastAt: string }>();
  for (const ev of events) {
    if (ev.status === "deleted") {
      byId.delete(ev.videoId);
      continue;
    }
    const prev = byId.get(ev.videoId);
    const baseMeta: YoutubeSummaryMeta = prev?.item ?? {
      videoId: ev.videoId,
      title: "",
      channel: "",
      url: "",
      durationSeconds: 0,
      captionLanguage: "",
      fetchedAt: "",
      updatedAt: "",
    };
    const nextMeta: YoutubeSummaryMeta = { ...baseMeta, ...(ev.meta || {}), videoId: ev.videoId };
    const next: YoutubeSummaryListItem = {
      ...nextMeta,
      status: ev.status,
      errorMessage: ev.status === "failed" ? ev.errorMessage : undefined,
    };
    byId.set(ev.videoId, { item: next, lastAt: ev.at });
  }
  return [...byId.values()]
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
    .map((e) => e.item);
}

export async function listSummaries(): Promise<YoutubeSummaryListItem[]> {
  const events = await readIndex();
  return foldIndexEvents(events);
}

// ---------- Markdown files ----------

function summaryFilePath(videoId: string): string {
  return path.join(config.youtubeSummariesDir, `${videoId}.md`);
}

export async function readMarkdown(videoId: string): Promise<string | null> {
  try {
    return await fs.readFile(summaryFilePath(videoId), "utf8");
  } catch {
    return null;
  }
}

export async function writeMarkdown(videoId: string, body: string): Promise<void> {
  await ensureDir();
  const file = summaryFilePath(videoId);
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, file);
}

export async function deleteMarkdown(videoId: string): Promise<void> {
  try {
    await fs.unlink(summaryFilePath(videoId));
  } catch {
    // already gone — fine
  }
}

export async function appendDeleteEvent(videoId: string): Promise<void> {
  await appendJsonl(config.youtubeIndexPath, {
    videoId,
    status: "deleted",
    at: new Date().toISOString(),
  });
}

// ---------- YAML front-matter ----------

export function buildFrontMatter(meta: YoutubeSummaryMeta): string {
  const lines = [
    "---",
    `videoId: ${meta.videoId}`,
    `title: ${JSON.stringify(meta.title)}`,
    `channel: ${JSON.stringify(meta.channel)}`,
    `url: ${meta.url}`,
    `durationSeconds: ${meta.durationSeconds}`,
    `captionLanguage: ${meta.captionLanguage}`,
    `fetchedAt: ${meta.fetchedAt}`,
    `updatedAt: ${meta.updatedAt}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

export function stripFrontMatter(markdown: string): { body: string; rawFront: string | null } {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { body: markdown, rawFront: null };
  return { body: markdown.slice(match[0].length), rawFront: match[1]! };
}

// ---------- Startup repair ----------

/** Marks any job stuck in "processing" (older than 5min) as failed. */
export async function repairOnStartup(now: number = Date.now()): Promise<void> {
  const jobs = await foldJobs();
  const STALE_MS = 5 * 60 * 1000;
  for (const j of jobs) {
    if (j.status !== "processing") continue;
    const updatedAt = Date.parse(j.updatedAt);
    if (Number.isFinite(updatedAt) && now - updatedAt < STALE_MS) continue;
    const failed: YoutubeJob = {
      ...j,
      status: "failed",
      updatedAt: new Date(now).toISOString(),
      errorMessage: "interrupted by bridge restart",
    };
    await appendJobEvent(failed);
    await appendIndexEvent({
      videoId: j.videoId,
      status: "failed",
      errorMessage: "interrupted by bridge restart",
      at: failed.updatedAt,
    });
  }
}

// ---------- helper for routes ----------

export type JobStateUpdate = {
  status: YoutubeJobStatus;
  errorMessage?: string;
  meta?: Partial<YoutubeSummaryMeta>;
};

export async function updateJob(job: YoutubeJob, update: JobStateUpdate): Promise<YoutubeJob> {
  const next: YoutubeJob = {
    ...job,
    status: update.status,
    updatedAt: new Date().toISOString(),
    errorMessage: update.errorMessage,
  };
  await appendJobEvent(next);
  await appendIndexEvent({
    videoId: job.videoId,
    status: update.status,
    meta: update.meta,
    errorMessage: update.errorMessage,
    at: next.updatedAt,
  });
  return next;
}
