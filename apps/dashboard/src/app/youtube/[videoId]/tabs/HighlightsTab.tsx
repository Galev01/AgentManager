"use client";

import { useEffect, useState } from "react";
import type {
  YoutubeHighlight,
  YoutubeHighlightsFile,
} from "@openclaw-manager/types";
import { Badge, Card, EmptyState, LoadingRow } from "@/components/ui";

type Props = {
  videoId: string;
};

type HighlightsResponse = {
  ok: boolean;
  videoId: string;
  highlights: YoutubeHighlightsFile | null;
};

// Highlight may include an optional numeric `score` beyond the strict type.
type HighlightWithScore = YoutubeHighlight & { score?: number };

function formatTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export function HighlightsTab({ videoId }: Props) {
  const [highlights, setHighlights] = useState<HighlightWithScore[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/youtube/highlights/${encodeURIComponent(videoId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HighlightsResponse;
        if (cancelled) return;
        const inner = data.highlights?.highlights ?? null;
        setHighlights(inner as HighlightWithScore[] | null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load highlights"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (loading) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <LoadingRow label="Loading highlights…" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <EmptyState title="Failed to load highlights" description={error} />
        </div>
      </Card>
    );
  }

  if (!highlights || highlights.length === 0) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <EmptyState
            title="No highlights yet"
            description="Use Rebuild → Highlights to extract memorable quotes."
          />
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {highlights.map((h) => {
        const startSec = Math.max(0, Math.floor(h.start ?? 0));
        const link = `https://youtube.com/watch?v=${videoId}&t=${startSec}s`;
        return (
          <Card key={h.id}>
            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <blockquote
                style={{
                  margin: 0,
                  paddingLeft: 12,
                  borderLeft: "3px solid var(--accent)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
                dir="auto"
              >
                {h.quote}
              </blockquote>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "var(--accent)",
                    fontSize: 12.5,
                    textDecoration: "none",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {formatTime(h.start)}
                  {h.end != null ? ` \u2192 ${formatTime(h.end)}` : ""}
                </a>
                {typeof h.score === "number" ? (
                  <Badge tone="info">score {h.score.toFixed(2)}</Badge>
                ) : null}
              </div>
              {h.reason ? (
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                    lineHeight: 1.45,
                  }}
                  dir="auto"
                >
                  {h.reason}
                </div>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
