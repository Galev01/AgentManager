import type {
  YoutubePromptPreset,
  YoutubeTranscriptFile,
  YoutubeVideoMetadataFile,
} from "@openclaw-manager/types";
import { PROMPT_PRESETS } from "./youtube-prompt-presets.js";

function mmss(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "??:??";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function buildSummaryMessage(
  meta: YoutubeVideoMetadataFile,
  transcript: YoutubeTranscriptFile,
  preset: YoutubePromptPreset
): string {
  const fullText = transcript.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
  return [
    preset.summaryInstructions,
    "",
    "---",
    "",
    `Title: ${meta.title}`,
    `Channel: ${meta.channel}`,
    `Duration: ${mmss(meta.durationSeconds)}`,
    `URL: ${meta.url}`,
    `Language: ${meta.captionLanguage}`,
    "",
    "Transcript:",
    fullText,
  ].join("\n");
}

export function getPreset(id: string): YoutubePromptPreset {
  const p = (PROMPT_PRESETS as Record<string, YoutubePromptPreset>)[id];
  if (!p) return PROMPT_PRESETS["key-points"];
  return p;
}
