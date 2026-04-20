import type MiniSearch from "minisearch";

export type RetrievedChunk = {
  id: string;
  start: number;
  end: number;
  text: string;
  score: number;
};

export function searchIndex(ms: MiniSearch, query: string, k = 6): RetrievedChunk[] {
  const raw = ms.search(query, { prefix: true, fuzzy: 0.2, boost: { text: 2 } });
  return raw.slice(0, k).map((r) => ({
    id: r.id as string,
    start: r.start as number,
    end: r.end as number,
    text: r.text as string,
    score: r.score,
  }));
}
