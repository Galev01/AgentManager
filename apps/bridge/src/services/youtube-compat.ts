import fs from "node:fs/promises";
import * as paths from "./youtube-paths.js";

export async function readSummaryWithFallback(
  videoId: string
): Promise<{ markdown: string; source: "v2" | "legacy" } | null> {
  try {
    const md = await fs.readFile(paths.summaryPath(videoId), "utf8");
    return { markdown: md, source: "v2" };
  } catch {}
  try {
    const md = await fs.readFile(paths.legacySummaryPath(videoId), "utf8");
    return { markdown: md, source: "legacy" };
  } catch {}
  return null;
}

export async function hasV2Artifacts(videoId: string): Promise<boolean> {
  try {
    await fs.stat(paths.transcriptPath(videoId));
    return true;
  } catch {
    return false;
  }
}
