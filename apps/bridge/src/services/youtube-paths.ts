import path from "node:path";
import { config } from "../config.js";

export function videoDir(videoId: string): string {
  return path.join(config.youtubeVideosDir, videoId);
}
export function metadataPath(videoId: string): string {
  return path.join(videoDir(videoId), "metadata.json");
}
export function transcriptPath(videoId: string): string {
  return path.join(videoDir(videoId), "transcript.json");
}
export function chunksPath(videoId: string): string {
  return path.join(videoDir(videoId), "chunks.json");
}
export function retrievalIndexPath(videoId: string): string {
  return path.join(videoDir(videoId), "retrieval-index.json");
}
export function summaryPath(videoId: string): string {
  return path.join(videoDir(videoId), "summary.md");
}
export function chatMetaPath(videoId: string): string {
  return path.join(videoDir(videoId), "chat-meta.json");
}
export function chatLogPath(videoId: string): string {
  return path.join(videoDir(videoId), "chat.jsonl");
}
export function chaptersPath(videoId: string): string {
  return path.join(videoDir(videoId), "chapters.json");
}
export function highlightsPath(videoId: string): string {
  return path.join(videoDir(videoId), "highlights.json");
}
export function legacySummaryPath(videoId: string): string {
  return path.join(config.youtubeSummariesDir, `${videoId}.md`);
}
