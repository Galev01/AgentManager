import fs from "node:fs/promises";
import * as paths from "./youtube-paths.js";
import type {
  YoutubeVideoMetadataFile,
  YoutubeTranscriptFile,
  YoutubeChunksFile,
  YoutubeChatMessageRow,
  YoutubeChatMetaFile,
  YoutubeChaptersFile,
  YoutubeHighlightsFile,
} from "@openclaw-manager/types";

async function ensureVideoDir(videoId: string): Promise<void> {
  await fs.mkdir(paths.videoDir(videoId), { recursive: true });
}

async function atomicWrite(filepath: string, data: string): Promise<void> {
  const tmp = filepath + ".tmp";
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, filepath);
}

async function readJson<T>(filepath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filepath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// --- metadata ---

export async function writeMetadata(meta: YoutubeVideoMetadataFile): Promise<void> {
  await ensureVideoDir(meta.videoId);
  await atomicWrite(paths.metadataPath(meta.videoId), JSON.stringify(meta, null, 2));
}
export async function readMetadata(videoId: string): Promise<YoutubeVideoMetadataFile | null> {
  return readJson<YoutubeVideoMetadataFile>(paths.metadataPath(videoId));
}

// --- transcript ---

export async function writeTranscript(tr: YoutubeTranscriptFile): Promise<void> {
  await ensureVideoDir(tr.videoId);
  await atomicWrite(paths.transcriptPath(tr.videoId), JSON.stringify(tr, null, 2));
}
export async function readTranscript(videoId: string): Promise<YoutubeTranscriptFile | null> {
  return readJson<YoutubeTranscriptFile>(paths.transcriptPath(videoId));
}

// --- chunks ---

export async function writeChunks(file: YoutubeChunksFile): Promise<void> {
  await ensureVideoDir(file.videoId);
  await atomicWrite(paths.chunksPath(file.videoId), JSON.stringify(file, null, 2));
}
export async function readChunks(videoId: string): Promise<YoutubeChunksFile | null> {
  return readJson<YoutubeChunksFile>(paths.chunksPath(videoId));
}

// --- summary ---

export async function writeSummary(videoId: string, markdown: string): Promise<void> {
  await ensureVideoDir(videoId);
  await atomicWrite(paths.summaryPath(videoId), markdown);
}
export async function readSummaryV2(videoId: string): Promise<string | null> {
  try {
    return await fs.readFile(paths.summaryPath(videoId), "utf8");
  } catch {
    return null;
  }
}

// --- chat meta ---

export async function writeChatMeta(meta: YoutubeChatMetaFile): Promise<void> {
  await ensureVideoDir(meta.videoId);
  await atomicWrite(paths.chatMetaPath(meta.videoId), JSON.stringify(meta, null, 2));
}
export async function readChatMeta(videoId: string): Promise<YoutubeChatMetaFile | null> {
  return readJson<YoutubeChatMetaFile>(paths.chatMetaPath(videoId));
}

// --- chat log (jsonl) ---

export async function appendChatRow(row: YoutubeChatMessageRow): Promise<void> {
  await ensureVideoDir(row.videoId);
  await fs.appendFile(paths.chatLogPath(row.videoId), JSON.stringify(row) + "\n", "utf8");
}

export async function readChatLog(videoId: string): Promise<YoutubeChatMessageRow[]> {
  try {
    const raw = await fs.readFile(paths.chatLogPath(videoId), "utf8");
    const out: YoutubeChatMessageRow[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function foldChatLog(videoId: string): Promise<YoutubeChatMessageRow[]> {
  const rows = await readChatLog(videoId);
  const byId = new Map<string, YoutubeChatMessageRow>();
  for (const r of rows) {
    const prev = byId.get(r.id);
    byId.set(r.id, prev ? { ...prev, ...r } : r);
  }
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// --- chapters ---

export async function writeChapters(f: YoutubeChaptersFile): Promise<void> {
  await ensureVideoDir(f.videoId);
  await atomicWrite(paths.chaptersPath(f.videoId), JSON.stringify(f, null, 2));
}
export async function readChapters(videoId: string): Promise<YoutubeChaptersFile | null> {
  return readJson<YoutubeChaptersFile>(paths.chaptersPath(videoId));
}

// --- highlights ---

export async function writeHighlights(f: YoutubeHighlightsFile): Promise<void> {
  await ensureVideoDir(f.videoId);
  await atomicWrite(paths.highlightsPath(f.videoId), JSON.stringify(f, null, 2));
}
export async function readHighlights(videoId: string): Promise<YoutubeHighlightsFile | null> {
  return readJson<YoutubeHighlightsFile>(paths.highlightsPath(videoId));
}
