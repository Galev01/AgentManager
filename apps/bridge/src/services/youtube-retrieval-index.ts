import fs from "node:fs/promises";
import MiniSearch from "minisearch";
import type { YoutubeChunk, YoutubeChunksFile } from "@openclaw-manager/types";
import * as paths from "./youtube-paths.js";

const INDEX_OPTIONS = {
  fields: ["text"],
  storeFields: ["id", "start", "end", "text"],
  idField: "id",
};

export function buildMiniSearch(chunks: YoutubeChunk[]): MiniSearch {
  const ms = new MiniSearch(INDEX_OPTIONS);
  ms.addAll(chunks);
  return ms;
}

export async function persistIndex(videoId: string, ms: MiniSearch): Promise<void> {
  const serialized = JSON.stringify(ms.toJSON());
  const p = paths.retrievalIndexPath(videoId);
  const tmp = p + ".tmp";
  await fs.writeFile(tmp, serialized, "utf8");
  await fs.rename(tmp, p);
}

export async function loadOrBuildIndex(
  videoId: string,
  fallbackChunks?: YoutubeChunksFile | null
): Promise<MiniSearch | null> {
  try {
    const raw = await fs.readFile(paths.retrievalIndexPath(videoId), "utf8");
    return MiniSearch.loadJSON(raw, INDEX_OPTIONS);
  } catch {
    if (fallbackChunks && fallbackChunks.chunks.length > 0) {
      const ms = buildMiniSearch(fallbackChunks.chunks);
      await persistIndex(videoId, ms);
      return ms;
    }
    return null;
  }
}
