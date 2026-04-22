import type {
  YoutubeRebuildPart,
  YoutubeTranscriptFile,
  YoutubeVideoMetadataFile,
} from "@openclaw-manager/types";
import { fetchCaptions, type CaptionsResult } from "./youtube-captions.js";
import { chunkTranscript } from "./youtube-chunker.js";
import { buildMiniSearch, persistIndex } from "./youtube-retrieval-index.js";
import {
  readTranscript,
  writeTranscript,
  writeMetadata,
  writeChunks,
} from "./youtube-store-v2.js";
import { invalidateSessionKey } from "./youtube-chat-session.js";
import { runSummaryNow } from "./youtube-worker.js";
import {
  beginRebuild,
  endRebuild,
  markPartDone,
  markPartRunning,
} from "./youtube-rebuild-status.js";

/**
 * Dependency graph for rebuild parts. Downstream parts list their upstream
 * dependencies — upstream runs first. `orderRebuildParts` does NOT auto-add
 * missing upstream dependencies; it only topologically orders the parts the
 * caller asked for.
 */
const DEPS: Record<YoutubeRebuildPart, YoutubeRebuildPart[]> = {
  captions: [],
  chunks: ["captions"],
  summary: ["chunks"],
  highlights: ["chunks"],
  chapters: ["captions"],
  // chat-history invalidates the OpenClaw session key; the next turn replays
  // summary + retrieves chunks, so both must exist first.
  "chat-history": ["summary", "chunks"],
};

/**
 * Canonical order — used as a stable tie-breaker for parts with the same
 * (or independent) dependency depth. Keep this in sync with the set members
 * of YoutubeRebuildPart.
 */
const CANONICAL_ORDER: YoutubeRebuildPart[] = [
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
];

const CANONICAL_INDEX: Record<YoutubeRebuildPart, number> = (() => {
  const m = {} as Record<YoutubeRebuildPart, number>;
  CANONICAL_ORDER.forEach((p, i) => {
    m[p] = i;
  });
  return m;
})();

/**
 * Topologically order the requested parts so that every part's upstream deps
 * (that are also in the requested set) come before it. Ties between parts
 * whose remaining deps are all satisfied are broken by canonical order.
 *
 * Duplicates are collapsed. Missing upstream deps are NOT auto-added — the
 * caller is responsible for specifying the full closure they want rebuilt.
 */
export function orderRebuildParts(parts: YoutubeRebuildPart[]): YoutubeRebuildPart[] {
  // Dedup input, preserve only known parts.
  const requested = new Set<YoutubeRebuildPart>();
  for (const p of parts) {
    if (p in DEPS) requested.add(p);
  }
  if (requested.size === 0) return [];

  // Kahn's algorithm over the sub-graph restricted to the requested set.
  const remainingDeps = new Map<YoutubeRebuildPart, Set<YoutubeRebuildPart>>();
  for (const p of requested) {
    const deps = new Set<YoutubeRebuildPart>();
    for (const d of DEPS[p]) {
      if (requested.has(d)) deps.add(d);
    }
    remainingDeps.set(p, deps);
  }

  const out: YoutubeRebuildPart[] = [];
  while (remainingDeps.size > 0) {
    // All parts currently with no outstanding deps, ordered canonically.
    const ready: YoutubeRebuildPart[] = [];
    for (const [p, deps] of remainingDeps) {
      if (deps.size === 0) ready.push(p);
    }
    if (ready.length === 0) {
      // Shouldn't happen given the static graph is acyclic, but guard anyway.
      throw new Error("orderRebuildParts: cycle detected in rebuild dependencies");
    }
    ready.sort((a, b) => CANONICAL_INDEX[a] - CANONICAL_INDEX[b]);
    const next = ready[0]!;
    out.push(next);
    remainingDeps.delete(next);
    for (const deps of remainingDeps.values()) {
      deps.delete(next);
    }
  }
  return out;
}

// --- Task 19: executeRebuild dispatch ---

export type RebuildContext = {
  videoId: string;
  url: string;
};

export type RebuildPartResult =
  | { part: YoutubeRebuildPart; ok: true }
  | { part: YoutubeRebuildPart; ok: false; error: string };

/**
 * Parts that get cascade-skipped when a given upstream part fails.
 * Keyed by the failing part → set of downstream parts to mark skipped.
 *
 * If captions fails, every other part is meaningless.
 * If chunks fails, summary/highlights/chat-history can't run.
 */
const CASCADE: Record<YoutubeRebuildPart, YoutubeRebuildPart[]> = {
  captions: ["chunks", "summary", "highlights", "chapters", "chat-history"],
  chunks: ["summary", "highlights", "chat-history"],
  summary: ["chat-history"],
  highlights: [],
  chapters: [],
  "chat-history": [],
};

/** Build a minimal YoutubeTranscriptFile from CaptionsResult. The captions
 * service currently returns only a joined transcript string, so we persist
 * a single-segment transcript tagged with the total duration. When the
 * captions service gains per-segment access this should be replaced. */
function captionsToTranscriptFile(
  videoId: string,
  captions: CaptionsResult,
): YoutubeTranscriptFile {
  const fetchedAt = new Date().toISOString();
  return {
    videoId,
    source: "youtube-transcript",
    language: captions.language,
    fetchedAt,
    segments: [
      {
        start: 0,
        duration: captions.durationSeconds,
        end: captions.durationSeconds,
        text: captions.transcript,
      },
    ],
  };
}

function captionsToMetadata(
  videoId: string,
  url: string,
  captions: CaptionsResult,
): YoutubeVideoMetadataFile {
  const now = new Date().toISOString();
  return {
    videoId,
    title: captions.title,
    channel: captions.channel,
    url,
    durationSeconds: captions.durationSeconds,
    captionLanguage: captions.language,
    fetchedAt: now,
    updatedAt: now,
  };
}

/**
 * Execute rebuild parts sequentially in dependency-safe order. Per-part
 * errors are captured (not rethrown), and downstream parts are marked
 * skipped via the CASCADE map so failed upstream work never silently
 * produces stale downstream artifacts.
 */
export async function executeRebuild(
  ctx: RebuildContext,
  parts: YoutubeRebuildPart[],
): Promise<RebuildPartResult[]> {
  const ordered = orderRebuildParts(parts);
  const results: RebuildPartResult[] = [];
  const failed = new Set<YoutubeRebuildPart>();

  beginRebuild(ctx.videoId, ordered);
  try {
    for (const part of ordered) {
      if (failed.has(part)) {
        // Figure out which upstream caused the skip for a readable message.
        const reason = findCascadeReason(part, failed);
        const error = `skipped: ${reason} failed`;
        results.push({ part, ok: false, error });
        markPartDone(ctx.videoId, part, "skipped", error);
        continue;
      }
      markPartRunning(ctx.videoId, part);
      try {
        await runPart(ctx, part);
        results.push({ part, ok: true });
        markPartDone(ctx.videoId, part, "ok");
      } catch (err: unknown) {
        const error = errorMessage(err);
        results.push({ part, ok: false, error });
        markPartDone(ctx.videoId, part, "failed", error);
        // Cascade: mark downstream parts as failed too.
        for (const downstream of CASCADE[part]) {
          failed.add(downstream);
        }
      }
    }
    return results;
  } finally {
    endRebuild(ctx.videoId);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || "unknown error";
  return String(err);
}

function findCascadeReason(
  part: YoutubeRebuildPart,
  failed: Set<YoutubeRebuildPart>,
): YoutubeRebuildPart {
  // Walk up the DEPS graph and return the first failed ancestor we meet.
  // Prefer direct deps over transitive ones for a clearer error message.
  const direct = DEPS[part].find((d) => failed.has(d));
  if (direct) return direct;
  // Fallback: any failed part that cascades to `part`.
  for (const [upstream, downstream] of Object.entries(CASCADE) as Array<[
    YoutubeRebuildPart,
    YoutubeRebuildPart[],
  ]>) {
    if (failed.has(upstream) && downstream.includes(part)) return upstream;
  }
  return part; // shouldn't happen
}

async function runPart(ctx: RebuildContext, part: YoutubeRebuildPart): Promise<void> {
  switch (part) {
    case "captions": {
      const captions = await fetchCaptions(ctx.videoId);
      const transcript = captionsToTranscriptFile(ctx.videoId, captions);
      const metadata = captionsToMetadata(ctx.videoId, ctx.url, captions);
      await writeTranscript(transcript);
      await writeMetadata(metadata);
      return;
    }
    case "chunks": {
      const transcript = await readTranscript(ctx.videoId);
      if (!transcript) throw new Error("no transcript on disk — run captions first");
      const chunksFile = chunkTranscript(transcript);
      await writeChunks(chunksFile);
      const index = buildMiniSearch(chunksFile.chunks);
      await persistIndex(ctx.videoId, index);
      return;
    }
    case "summary": {
      // Runs the v1 summary pipeline inline (not through the FIFO queue).
      // See youtube-worker.runSummaryNow for rationale.
      await runSummaryNow(ctx.videoId, ctx.url);
      return;
    }
    case "highlights": {
      console.warn("[rebuild] highlights not implemented yet");
      return;
    }
    case "chapters": {
      console.warn("[rebuild] chapters not implemented yet");
      return;
    }
    case "chat-history": {
      // Invalidation forces the next chat turn to spin up a fresh OpenClaw
      // session with replay context (summary + recent turns).
      await invalidateSessionKey(ctx.videoId);
      return;
    }
  }
}
