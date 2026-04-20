import type {
  YoutubeTranscriptFile,
  YoutubeChunksFile,
  YoutubeChunk,
  YoutubeChunkerStrategy,
} from "@openclaw-manager/types";
import { chunkId } from "./youtube-chunk-id.js";

export const DEFAULT_STRATEGY: YoutubeChunkerStrategy = {
  maxChars: 1200,
  overlapChars: 150,
  maxSegmentsPerChunk: 40,
};

const CHUNKER_VERSION = "v2";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkTranscript(
  transcript: YoutubeTranscriptFile,
  strategy: YoutubeChunkerStrategy = DEFAULT_STRATEGY
): YoutubeChunksFile {
  const chunks: YoutubeChunk[] = [];
  const segs = transcript.segments;
  let i = 0;

  while (i < segs.length) {
    let text = "";
    const indexes: number[] = [];
    const start = segs[i]!.start;
    let end = segs[i]!.end;

    while (i < segs.length) {
      const s = segs[i]!;
      const next = text ? text + " " + s.text : s.text;
      const normalized = next.replace(/\s+/g, " ").trim();
      if (
        indexes.length > 0 &&
        (normalized.length > strategy.maxChars ||
          indexes.length >= strategy.maxSegmentsPerChunk)
      ) {
        break;
      }
      text = normalized;
      indexes.push(i);
      end = s.end;
      i++;
    }

    if (indexes.length === 0) break;
    chunks.push({
      id: chunkId(transcript.videoId, start),
      videoId: transcript.videoId,
      start,
      end,
      text,
      segmentIndexes: indexes,
      tokenEstimate: estimateTokens(text),
    });

    if (i < segs.length && strategy.overlapChars > 0) {
      let overlap = 0;
      let j = indexes.length - 1;
      while (j >= 0 && overlap < strategy.overlapChars) {
        overlap += segs[indexes[j]!]!.text.length;
        j--;
      }
      // j+1 is the first segment index to reuse in the next chunk (the overlap window)
      // Clamp so we always advance: next chunk start must be > indexes[0]
      const overlapStart = indexes[j + 1];
      const minNext = indexes[0]! + 1;
      if (overlapStart !== undefined && overlapStart > minNext) {
        i = overlapStart;
      }
      // If overlapStart <= minNext, keep i as-is (already past all consumed segments)
    }
  }

  return {
    videoId: transcript.videoId,
    createdAt: new Date().toISOString(),
    chunkerVersion: CHUNKER_VERSION,
    strategy,
    chunks,
  };
}
