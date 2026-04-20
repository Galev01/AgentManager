"use client";

import { useEffect, useState } from "react";
import type { YoutubeChaptersFile, YoutubeChapter } from "@openclaw-manager/types";
import { Card, EmptyState, LoadingRow } from "@/components/ui";

type Props = {
  videoId: string;
};

type ChaptersResponse = {
  ok: boolean;
  videoId: string;
  chapters: YoutubeChaptersFile | null;
};

function formatTime(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

// Chapter shape may include a `summary` field beyond the strict type.
type ChapterWithSummary = YoutubeChapter & { summary?: string };

export function ChaptersTab({ videoId }: Props) {
  const [chapters, setChapters] = useState<ChapterWithSummary[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/youtube/chapters/${encodeURIComponent(videoId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ChaptersResponse;
        if (cancelled) return;
        const inner = data.chapters?.chapters ?? null;
        setChapters(inner as ChapterWithSummary[] | null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load chapters");
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
          <LoadingRow label="Loading chapters\u2026" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <EmptyState title="Failed to load chapters" description={error} />
        </div>
      </Card>
    );
  }

  if (!chapters || chapters.length === 0) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <EmptyState
            title="No chapters yet"
            description="Use Rebuild \u2192 Chapters to extract chapters from this video."
          />
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {chapters.map((ch) => {
        const startSec = Math.max(0, Math.floor(ch.start ?? 0));
        const link = `https://youtube.com/watch?v=${videoId}&t=${startSec}s`;
        return (
          <Card key={ch.id}>
            <div
              style={{
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }} dir="auto">
                  {ch.title || "Untitled chapter"}
                </span>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 12.5,
                  }}
                >
                  {formatTime(ch.start)}
                  {ch.end != null ? ` \u2192 ${formatTime(ch.end)}` : ""}
                </span>
              </div>
              {ch.summary ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    lineHeight: 1.5,
                  }}
                  dir="auto"
                >
                  {ch.summary}
                </div>
              ) : null}
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "var(--accent)",
                  fontSize: 12.5,
                  textDecoration: "none",
                }}
              >
                Open at {formatTime(ch.start)} on YouTube
              </a>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
