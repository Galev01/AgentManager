import type { YoutubeRebuildPart } from "@openclaw-manager/types";

/**
 * Dependency graph for rebuild parts. Downstream parts list their upstream
 * dependencies — upstream runs first. `orderRebuildParts` does NOT auto-add
 * missing upstream dependencies; it only topologically orders the parts the
 * caller asked for.
 */
const DEPS: Record<YoutubeRebuildPart, YoutubeRebuildPart[]> = {
  captions: [],
  chunks: ["captions"],
  summary: ["chunks"],
  highlights: ["chunks"],
  chapters: ["captions"],
  // chat-history invalidates the OpenClaw session key; the next turn replays
  // summary + retrieves chunks, so both must exist first.
  "chat-history": ["summary", "chunks"],
};

/**
 * Canonical order — used as a stable tie-breaker for parts with the same
 * (or independent) dependency depth. Keep this in sync with the set members
 * of YoutubeRebuildPart.
 */
const CANONICAL_ORDER: YoutubeRebuildPart[] = [
  "captions",
  "chunks",
  "summary",
  "highlights",
  "chapters",
  "chat-history",
];

const CANONICAL_INDEX: Record<YoutubeRebuildPart, number> = (() => {
  const m = {} as Record<YoutubeRebuildPart, number>;
  CANONICAL_ORDER.forEach((p, i) => {
    m[p] = i;
  });
  return m;
})();

/**
 * Topologically order the requested parts so that every part's upstream deps
 * (that are also in the requested set) come before it. Ties between parts
 * whose remaining deps are all satisfied are broken by canonical order.
 *
 * Duplicates are collapsed. Missing upstream deps are NOT auto-added — the
 * caller is responsible for specifying the full closure they want rebuilt.
 */
export function orderRebuildParts(parts: YoutubeRebuildPart[]): YoutubeRebuildPart[] {
  // Dedup input, preserve only known parts.
  const requested = new Set<YoutubeRebuildPart>();
  for (const p of parts) {
    if (p in DEPS) requested.add(p);
  }
  if (requested.size === 0) return [];

  // Kahn's algorithm over the sub-graph restricted to the requested set.
  const remainingDeps = new Map<YoutubeRebuildPart, Set<YoutubeRebuildPart>>();
  for (const p of requested) {
    const deps = new Set<YoutubeRebuildPart>();
    for (const d of DEPS[p]) {
      if (requested.has(d)) deps.add(d);
    }
    remainingDeps.set(p, deps);
  }

  const out: YoutubeRebuildPart[] = [];
  while (remainingDeps.size > 0) {
    // All parts currently with no outstanding deps, ordered canonically.
    const ready: YoutubeRebuildPart[] = [];
    for (const [p, deps] of remainingDeps) {
      if (deps.size === 0) ready.push(p);
    }
    if (ready.length === 0) {
      // Shouldn't happen given the static graph is acyclic, but guard anyway.
      throw new Error("orderRebuildParts: cycle detected in rebuild dependencies");
    }
    ready.sort((a, b) => CANONICAL_INDEX[a] - CANONICAL_INDEX[b]);
    const next = ready[0]!;
    out.push(next);
    remainingDeps.delete(next);
    for (const deps of remainingDeps.values()) {
      deps.delete(next);
    }
  }
  return out;
}
