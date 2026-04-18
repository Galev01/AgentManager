import fs from "node:fs/promises";
import { Router, type Router as ExpressRouter, type Request, type Response } from "express";
import { parseVideoId, isValidVideoId } from "../services/youtube-url.js";
import {
  listSummaries,
  activeJobs,
  readMarkdown,
  deleteMarkdown,
  appendDeleteEvent,
  stripFrontMatter,
  foldJobs,
} from "../services/youtube-store.js";
import { submit } from "../services/youtube-worker.js";
import type {
  YoutubeJob,
  YoutubeRejectedUrl,
  YoutubeSubmitResponse,
  YoutubeSummaryMeta,
} from "@openclaw-manager/types";

const router: ExpressRouter = Router();

function badId(res: Response): void {
  res.status(400).json({ error: "invalid videoId" });
}

router.post("/youtube/jobs", async (req: Request, res: Response) => {
  const urls: unknown = req.body?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return void res.status(400).json({ error: "urls must be a non-empty array" });
  }
  const jobs: YoutubeJob[] = [];
  const rejected: YoutubeRejectedUrl[] = [];
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw : "";
    try {
      const videoId = parseVideoId(url);
      const job = await submit(url, videoId);
      jobs.push(job);
    } catch (err: any) {
      rejected.push({ url, reason: err?.message || "invalid url" });
    }
  }
  if (jobs.length === 0) {
    return void res.status(400).json({ error: "no valid urls", rejected });
  }
  const payload: YoutubeSubmitResponse = { jobs, rejected };
  res.status(202).json(payload);
});

router.get("/youtube/jobs", async (_req: Request, res: Response) => {
  try {
    const jobs = await activeJobs();
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/youtube/summaries", async (_req: Request, res: Response) => {
  try {
    const summaries = await listSummaries();
    res.json({ summaries });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.get("/youtube/summaries/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    const raw = await readMarkdown(videoId);
    if (raw === null) return void res.status(404).json({ error: "summary not found" });
    const { body, rawFront } = stripFrontMatter(raw);
    const meta = parseFrontMatter(rawFront, videoId);
    res.json({ meta, markdown: body });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.post("/youtube/summaries/:videoId/rerun", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    // Find the existing summary's URL so we can resubmit with the same canonical url.
    const summaries = await listSummaries();
    const existing = summaries.find((s) => s.videoId === videoId);
    const url = existing?.url || `https://www.youtube.com/watch?v=${videoId}`;
    const job = await submit(url, videoId);
    res.status(202).json({ job });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

router.delete("/youtube/summaries/:videoId", async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!isValidVideoId(videoId)) return badId(res);
  try {
    await deleteMarkdown(videoId);
    await appendDeleteEvent(videoId);
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "failed" });
  }
});

function parseFrontMatter(raw: string | null, videoId: string): YoutubeSummaryMeta {
  const empty: YoutubeSummaryMeta = {
    videoId,
    title: "",
    channel: "",
    url: "",
    durationSeconds: 0,
    captionLanguage: "",
    fetchedAt: "",
    updatedAt: "",
  };
  if (!raw) return empty;
  const out = { ...empty };
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw!.trim();
    switch (key) {
      case "videoId": out.videoId = unquote(val); break;
      case "title": out.title = unquote(val); break;
      case "channel": out.channel = unquote(val); break;
      case "url": out.url = unquote(val); break;
      case "durationSeconds": out.durationSeconds = Number(val) || 0; break;
      case "captionLanguage": out.captionLanguage = unquote(val); break;
      case "fetchedAt": out.fetchedAt = unquote(val); break;
      case "updatedAt": out.updatedAt = unquote(val); break;
    }
  }
  return out;
}

function unquote(v: string): string {
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}

export default router;
