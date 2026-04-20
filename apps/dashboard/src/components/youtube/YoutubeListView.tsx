"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  YoutubeJob,
  YoutubeJobStatus,
  YoutubeSummaryListItem,
} from "@openclaw-manager/types";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  type DataTableColumn,
} from "@/components/ui";

const POLL_INTERVAL_MS = 3000;

type Props = {
  initialSummaries: YoutubeSummaryListItem[];
  initialJobs: YoutubeJob[];
};

type RejectedUrl = { url: string; reason: string };

function StatusBadge({ status }: { status: YoutubeJobStatus }) {
  const toneMap: Record<YoutubeJobStatus, Parameters<typeof Badge>[0]["tone"]> = {
    queued: "neutral",
    processing: "info",
    done: "ok",
    failed: "error",
  };
  return <Badge tone={toneMap[status]}>{status}</Badge>;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function YoutubeListView({ initialSummaries, initialJobs }: Props) {
  const [summaries, setSummaries] = useState<YoutubeSummaryListItem[]>(initialSummaries);
  const [activeJobs, setActiveJobs] = useState<YoutubeJob[]>(initialJobs);
  const [urlsText, setUrlsText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<RejectedUrl[]>([]);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sRes, jRes] = await Promise.all([
        fetch("/api/youtube/summaries", { cache: "no-store" }),
        fetch("/api/youtube/jobs", { cache: "no-store" }),
      ]);
      if (sRes.ok)
        setSummaries(((await sRes.json()) as { summaries: YoutubeSummaryListItem[] }).summaries);
      if (jRes.ok)
        setActiveJobs(((await jRes.json()) as { jobs: YoutubeJob[] }).jobs);
    } catch {
      // network blip — try again next tick
    }
  }, []);

  // Poll while there are non-terminal jobs.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    pollTimer.current = setTimeout(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [activeJobs, refresh]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const urls = urlsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (urls.length === 0) return;
      setSubmitting(true);
      setSubmitError(null);
      setRejected([]);
      try {
        const res = await fetch("/api/youtube/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            rejected?: RejectedUrl[];
          };
          setSubmitError(body.error || `submit failed (${res.status})`);
          if (body.rejected) setRejected(body.rejected);
          return;
        }
        const body = (await res.json()) as {
          jobs: YoutubeJob[];
          rejected: RejectedUrl[];
        };
        setRejected(body.rejected);
        setUrlsText("");
        await refresh();
      } catch (err: unknown) {
        setSubmitError((err as Error)?.message || "submit failed");
      } finally {
        setSubmitting(false);
      }
    },
    [urlsText, refresh]
  );

  const handleRerun = useCallback(
    async (videoId: string) => {
      setBusyRow(videoId);
      try {
        const res = await fetch(
          `/api/youtube/summaries/${encodeURIComponent(videoId)}/rerun`,
          { method: "POST" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setSubmitError(body.error || `rerun failed (${res.status})`);
          return;
        }
        await refresh();
      } catch (err: unknown) {
        setSubmitError((err as Error)?.message || "rerun failed");
      } finally {
        setBusyRow(null);
      }
    },
    [refresh]
  );

  const handleDelete = useCallback(
    async (videoId: string) => {
      if (!confirm(`Delete summary for ${videoId}?`)) return;
      setBusyRow(videoId);
      try {
        const res = await fetch(
          `/api/youtube/summaries/${encodeURIComponent(videoId)}`,
          { method: "DELETE" }
        );
        if (!res.ok && res.status !== 204) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setSubmitError(body.error || `delete failed (${res.status})`);
          return;
        }
        await refresh();
      } catch (err: unknown) {
        setSubmitError((err as Error)?.message || "delete failed");
      } finally {
        setBusyRow(null);
      }
    },
    [refresh]
  );

  const columns = useMemo<DataTableColumn<YoutubeSummaryListItem>[]>(
    () => [
      {
        key: "title",
        header: "Title",
        render: (row) => (
          <Link
            href={`/youtube/${encodeURIComponent(row.videoId)}`}
            style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 500 }}
          >
            {row.title || row.videoId}
          </Link>
        ),
      },
      {
        key: "channel",
        header: "Channel",
        render: (row) => row.channel || "\u2014",
      },
      {
        key: "duration",
        header: "Duration",
        width: "100px",
        render: (row) => formatDuration(row.durationSeconds),
      },
      {
        key: "createdAt",
        header: "Added",
        width: "140px",
        render: (row) => formatWhen(row.fetchedAt || row.updatedAt),
      },
      {
        key: "status",
        header: "Status",
        width: "110px",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "actions",
        header: "",
        width: "160px",
        render: (row) => (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyRow === row.videoId}
              onClick={() => void handleRerun(row.videoId)}
            >
              Rerun
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busyRow === row.videoId}
              onClick={() => void handleDelete(row.videoId)}
            >
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [busyRow, handleRerun, handleDelete]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <form onSubmit={handleSubmit} className="card" style={{ padding: 14 }}>
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="Paste YouTube URLs, one per line"
          rows={3}
          disabled={submitting}
          style={{
            width: "100%",
            fontFamily: "inherit",
            fontSize: 13,
            padding: "8px 10px",
            background: "var(--bg-input, var(--bg))",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            resize: "vertical",
          }}
        />
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || urlsText.trim().length === 0}
          >
            {submitting ? "Submitting\u2026" : "Summarize"}
          </Button>
          {activeJobs.length > 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {activeJobs.length} active
            </span>
          ) : null}
        </div>
        {submitError ? (
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--danger, #f87171)" }}>
            {submitError}
          </p>
        ) : null}
        {rejected.length > 0 ? (
          <ul
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--danger, #f87171)",
              listStyle: "none",
              padding: 0,
            }}
          >
            {rejected.map((r, i) => (
              <li key={i}>
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {r.url || "(empty)"}:
                </span>{" "}
                {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="card" style={{ overflow: "hidden" }}>
        <DataTable<YoutubeSummaryListItem>
          columns={columns}
          rows={summaries}
          rowKey={(row) => row.videoId}
          emptyState={
            <EmptyState
              title="No summaries yet"
              description="Paste a YouTube URL above to queue a summary."
            />
          }
        />
      </div>
    </div>
  );
}
