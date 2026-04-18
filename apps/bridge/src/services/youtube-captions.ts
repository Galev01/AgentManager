// youtube-transcript@1.3.0 ships a CJS file as `main` but also sets
// `"type": "module"` in its package.json, so Node resolves `main` as ESM
// and fails to find any named exports. Import the ESM bundle directly to
// bypass the broken `main` resolution.
// @ts-expect-error — dist path has no bundled types; we cast via the root.
import { YoutubeTranscript as YoutubeTranscriptRuntime } from "youtube-transcript/dist/youtube-transcript.esm.js";
import type { YoutubeTranscript as YoutubeTranscriptType } from "youtube-transcript";
const YoutubeTranscript: typeof YoutubeTranscriptType = YoutubeTranscriptRuntime;

export type CaptionsResult = {
  title: string;
  channel: string;
  durationSeconds: number;
  language: string;
  transcript: string;
};

export class CaptionsUnavailableError extends Error {
  constructor(message = "captions unavailable for this video") {
    super(message);
    this.name = "CaptionsUnavailableError";
  }
}

export class VideoNotFoundError extends Error {
  constructor(message = "youtube video not found") {
    super(message);
    this.name = "VideoNotFoundError";
  }
}

export class TranscriptTooShortError extends Error {
  constructor(message = "transcript too short to summarize") {
    super(message);
    this.name = "TranscriptTooShortError";
  }
}

const MIN_TRANSCRIPT_CHARS = 200;

async function fetchOEmbed(videoId: string): Promise<{ title: string; channel: string }> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`;
  const res = await fetch(url);
  if (res.status === 401 || res.status === 404) throw new VideoNotFoundError();
  if (!res.ok) throw new Error(`oembed failed: ${res.status}`);
  const data = (await res.json()) as { title?: unknown; author_name?: unknown };
  return {
    title: typeof data.title === "string" ? data.title : "(untitled)",
    channel: typeof data.author_name === "string" ? data.author_name : "(unknown)",
  };
}

async function fetchTranscriptSafe(
  videoId: string
): Promise<{ text: string; language: string; durationSeconds: number }> {
  type Segment = { text: string; duration?: number; offset?: number; lang?: string };
  let segments: Segment[];
  try {
    segments = (await YoutubeTranscript.fetchTranscript(videoId)) as Segment[];
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/disabled|unavailable|no transcript/i.test(msg)) {
      throw new CaptionsUnavailableError();
    }
    if (/not found|invalid/i.test(msg)) {
      throw new VideoNotFoundError();
    }
    throw new CaptionsUnavailableError(msg);
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new CaptionsUnavailableError();
  }
  const text = segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < MIN_TRANSCRIPT_CHARS) throw new TranscriptTooShortError();

  const language = segments.find((s) => typeof s.lang === "string")?.lang || "unknown";
  const durationSeconds = Math.round(
    segments.reduce((acc, s) => acc + (typeof s.duration === "number" ? s.duration : 0), 0)
  );
  return { text, language, durationSeconds };
}

export async function fetchCaptions(videoId: string): Promise<CaptionsResult> {
  const [meta, tr] = await Promise.all([fetchOEmbed(videoId), fetchTranscriptSafe(videoId)]);
  return {
    title: meta.title,
    channel: meta.channel,
    durationSeconds: tr.durationSeconds,
    language: tr.language,
    transcript: tr.text,
  };
}
