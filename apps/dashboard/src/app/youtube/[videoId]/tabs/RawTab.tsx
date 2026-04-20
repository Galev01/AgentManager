"use client";

import { useEffect, useState } from "react";
import type { YoutubeChunk, YoutubeChunksFile } from "@openclaw-manager/types";
import {
  Card,
  DataTable,
  EmptyState,
  LoadingRow,
  TableWrap,
  type DataTableColumn,
} from "@/components/ui";

type Props = {
  videoId: string;
};

type ChunksResponse = {
  ok: boolean;
  videoId: string;
  chunks: YoutubeChunksFile | null;
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

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "\u2026";
}

export function RawTab({ videoId }: Props) {
  const [chunks, setChunks] = useState<YoutubeChunk[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/youtube/chunks/${encodeURIComponent(videoId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ChunksResponse;
        if (cancelled) return;
        setChunks(data.chunks?.chunks ?? null);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load chunks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  if (error && !loading) {
    return (
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <EmptyState title="Failed to load chunks" description={error} />
        </div>
      </Card>
    );
  }

  const columns: DataTableColumn<YoutubeChunk>[] = [
    {
      key: "id",
      header: "ID",
      width: "10ch",
      render: (row) => (
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
          title={row.id}
        >
          {truncate(row.id, 8)}
        </span>
      ),
    },
    {
      key: "start",
      header: "Start",
      width: "8ch",
      render: (row) => (
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>
          {formatTime(row.start)}
        </span>
      ),
    },
    {
      key: "end",
      header: "End",
      width: "8ch",
      render: (row) => (
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>
          {formatTime(row.end)}
        </span>
      ),
    },
    {
      key: "tokenEstimate",
      header: "Tokens",
      width: "8ch",
      render: (row) => (
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 }}>
          {row.tokenEstimate}
        </span>
      ),
    },
    {
      key: "text",
      header: "Text",
      render: (row) => (
        <span
          style={{ fontSize: 12.5, color: "var(--text)" }}
          title={row.text}
          dir="auto"
        >
          {truncate(row.text, 100)}
        </span>
      ),
    },
  ];

  return (
    <TableWrap>
      <DataTable<YoutubeChunk>
        columns={columns}
        rows={chunks ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        emptyState={
          <div style={{ padding: "14px 16px" }}>
            {loading ? (
              <LoadingRow label="Loading chunks\u2026" />
            ) : (
              <EmptyState
                title="No chunks yet"
                description="Use Rebuild \u2192 Chunks to chunk the captions for this video."
              />
            )}
          </div>
        }
      />
    </TableWrap>
  );
}
