"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { YoutubeJob, YoutubeSummaryListItem, YoutubeJobStatus } from "@openclaw-manager/types";

const POLL_INTERVAL_MS = 3000;

type Props = {
  initialSummaries: YoutubeSummaryListItem[];
  initialJobs: YoutubeJob[];
  selectedVideoId: string | null;
};

export function SummaryListPane({ initialSummaries, initialJobs, selectedVideoId }: Props) {
  const [summaries, setSummaries] = useState<YoutubeSummaryListItem[]>(initialSummaries);
  const [activeJobs, setActiveJobs] = useState<YoutubeJob[]>(initialJobs);
  const [urlsText, setUrlsText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ url: string; reason: string }[]>([]);
  const router = useRouter();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sRes, jRes] = await Promise.all([
        fetch("/api/youtube/summaries", { cache: "no-store" }),
        fetch("/api/youtube/jobs", { cache: "no-store" }),
      ]);
      if (sRes.ok) setSummaries(((await sRes.json()) as { summaries: YoutubeSummaryListItem[] }).summaries);
      if (jRes.ok) setActiveJobs(((await jRes.json()) as { jobs: YoutubeJob[] }).jobs);
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = urlsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
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
        const body = (await res.json().catch(() => ({}))) as { error?: string; rejected?: { url: string; reason: string }[] };
        setSubmitError(body.error || `submit failed (${res.status})`);
        if (body.rejected) setRejected(body.rejected);
        return;
      }
      const body = (await res.json()) as { jobs: YoutubeJob[]; rejected: { url: string; reason: string }[] };
      setRejected(body.rejected);
      setUrlsText("");
      await refresh();
    } catch (err: unknown) {
      setSubmitError((err as Error)?.message || "submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [urlsText, refresh]);

  return (
    <div className="flex h-full flex-col border-r border-dark-border bg-dark-card">
      <form onSubmit={handleSubmit} className="border-b border-dark-border p-4">
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          placeholder="Paste YouTube URLs, one per line"
          rows={3}
          className="w-full rounded border border-dark-border bg-dark-lighter px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
          disabled={submitting}
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="submit"
            disabled={submitting || urlsText.trim().length === 0}
            className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Submitting\u2026" : "Summarize"}
          </button>
          {activeJobs.length > 0 ? (
            <span className="text-xs text-text-muted">{activeJobs.length} active</span>
          ) : null}
        </div>
        {submitError ? <p className="mt-2 text-xs text-red-400">{submitError}</p> : null}
        {rejected.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-red-400">
            {rejected.map((r, i) => (
              <li key={i}>
                <span className="font-mono">{r.url || "(empty)"}:</span> {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="flex-1 overflow-y-auto">
        {summaries.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No summaries yet. Paste a URL above to get started.</p>
        ) : (
          <ul>
            {summaries.map((s) => (
              <li key={s.videoId}>
                <Link
                  href={`/youtube?v=${encodeURIComponent(s.videoId)}`}
                  scroll={false}
                  className={`block border-b border-dark-border px-4 py-3 text-sm transition hover:bg-dark-lighter ${
                    selectedVideoId === s.videoId ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-text-primary">
                        {s.title || s.videoId}
                      </div>
                      <div className="truncate text-xs text-text-muted">{s.channel || "\u2014"}</div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: YoutubeJobStatus }) {
  const styles: Record<YoutubeJobStatus, string> = {
    queued: "bg-zinc-700/40 text-zinc-300",
    processing: "bg-blue-600/30 text-blue-200",
    done: "bg-emerald-600/30 text-emerald-200",
    failed: "bg-red-600/30 text-red-200",
  };
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
