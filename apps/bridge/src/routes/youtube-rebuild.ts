import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { isValidVideoId } from "../services/youtube-url.js";
import { executeRebuild } from "../services/youtube-rebuild.js";
import {
  getStatus as getRebuildStatus,
  listActive as listActiveRebuilds,
} from "../services/youtube-rebuild-status.js";
import {
  readChapters,
  readChunks,
  readHighlights,
  readMetadata,
} from "../services/youtube-store-v2.js";
import { listSummaries } from "../services/youtube-store.js";
import type { YoutubeRebuildPart } from "@openclaw-manager/types";

const router: ExpressRouter = Router();

const VALID_PARTS: ReadonlySet<YoutubeRebuildPart> = new Set<YoutubeRebuildPart>([
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
]);

function badId(res: Response): void {
  res.status(400).json({ ok: false, error: "invalid videoId" });
}

async function resolveUrl(videoId: string, bodyUrl: unknown): Promise<string | null> {
  if (typeof bodyUrl === "string" && bodyUrl.trim()) return bodyUrl.trim();
  const meta = await readMetadata(videoId);
  if (meta?.url) return meta.url;
  // Legacy fallback: v1 summaries index may carry the canonical url.
  try {
    const summaries = await listSummaries();
    const found = summaries.find((s) => s.videoId === videoId);
    if (found?.url) return found.url;
  } catch {
    // non-fatal: legacy store unavailable
  }
  return null;
}

// sync await per v2 plan; wrap in job if blocks too long
router.post("/youtube/rebuild/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);

  const rawParts: unknown = req.body?.parts;
  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    return void res
      .status(400)
      .json({ ok: false, error: "parts must be a non-empty array" });
  }
  const parts: YoutubeRebuildPart[] = [];
  for (const p of rawParts) {
    if (typeof p !== "string" || !VALID_PARTS.has(p as YoutubeRebuildPart)) {
      return void res
        .status(400)
        .json({ ok: false, error: `invalid part: ${String(p)}` });
    }
    parts.push(p as YoutubeRebuildPart);
  }

  const url = await resolveUrl(videoId, req.body?.url);
  if (!url) {
    return void res
      .status(400)
      .json({ ok: false, error: "no url — provide body.url or run captions first" });
  }

  try {
    const results = await executeRebuild({ videoId, url }, parts);
    res.json({ ok: true, videoId, results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

// Live rebuild status endpoints. `/active` MUST be registered before
// `/:videoId/status` so it's matched first (Express scans handlers in
// registration order; `active` would otherwise match `:videoId`).
router.get("/youtube/rebuild/active", (_req: Request, res: Response) => {
  res.json({ ok: true, statuses: listActiveRebuilds() });
});

router.get("/youtube/rebuild/:videoId/status", (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  const status = getRebuildStatus(videoId);
  res.json({ ok: true, status });
});

router.get("/youtube/chunks/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    const chunks = await readChunks(videoId);
    res.json({ ok: true, videoId, chunks });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

router.get("/youtube/chapters/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    const chapters = await readChapters(videoId);
    res.json({ ok: true, videoId, chapters });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

router.get("/youtube/highlights/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    const highlights = await readHighlights(videoId);
    res.json({ ok: true, videoId, highlights });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "failed" });
  }
});

export default router;
