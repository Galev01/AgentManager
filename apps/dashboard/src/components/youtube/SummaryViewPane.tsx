"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { YoutubeSummaryListItem, YoutubeSummaryMeta } from "@openclaw-manager/types";

type Props = {
  selectedVideoId: string | null;
};

type LoadedSummary = {
  meta: YoutubeSummaryMeta;
  markdown: string;
} | null;

export function SummaryViewPane({ selectedVideoId }: Props) {
  const [summary, setSummary] = useState<LoadedSummary>(null);
  const [listItem, setListItem] = useState<YoutubeSummaryListItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const load = useCallback(async (videoId: string) => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/youtube/summaries/${encodeURIComponent(videoId)}`, { cache: "no-store" }),
        fetch(`/api/youtube/summaries`, { cache: "no-store" }),
      ]);
      if (sRes.ok) {
        setSummary((await sRes.json()) as LoadedSummary);
      } else {
        setSummary(null);
      }
      if (lRes.ok) {
        const all = ((await lRes.json()) as { summaries: YoutubeSummaryListItem[] }).summaries;
        setListItem(all.find((s) => s.videoId === videoId) ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedVideoId) {
      setSummary(null);
      setListItem(null);
      return;
    }
    void load(selectedVideoId);
  }, [selectedVideoId, load]);

  // Re-poll while the selected item is non-terminal.
  useEffect(() => {
    if (!selectedVideoId || !listItem) return;
    if (listItem.status === "done" || listItem.status === "failed") return;
    const t = setTimeout(() => void load(selectedVideoId), 3000);
    return () => clearTimeout(t);
  }, [selectedVideoId, listItem, load]);

  const onRerun = useCallback(async () => {
    if (!selectedVideoId) return;
    setBusy(true);
    try {
      await fetch(`/api/youtube/summaries/${encodeURIComponent(selectedVideoId)}/rerun`, {
        method: "POST",
      });
      await load(selectedVideoId);
    } finally {
      setBusy(false);
    }
  }, [selectedVideoId, load]);

  const onDelete = useCallback(async () => {
    if (!selectedVideoId) return;
    if (!confirm("Delete this summary?")) return;
    setBusy(true);
    try {
      await fetch(`/api/youtube/summaries/${encodeURIComponent(selectedVideoId)}`, {
        method: "DELETE",
      });
      router.replace("/youtube");
    } finally {
      setBusy(false);
    }
  }, [selectedVideoId, router]);

  if (!selectedVideoId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-text-muted">
        Pick a summary on the left, or paste a URL to create a new one.
      </div>
    );
  }

  if (loading && !summary) {
    return <div className="p-6 text-sm text-text-muted">Loading\u2026</div>;
  }

  const status = listItem?.status ?? "done";
  const title = listItem?.title || summary?.meta.title || selectedVideoId;
  const channel = listItem?.channel || summary?.meta.channel || "";
  const url = listItem?.url || summary?.meta.url || `https://www.youtube.com/watch?v=${selectedVideoId}`;
  const terminal = status === "done" || status === "failed";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-dark-border p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-text-primary">{title}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {channel}
              {channel ? " \xb7 " : ""}
              <a href={url} target="_blank" rel="noreferrer" className="underline hover:text-primary">
                Open on YouTube
              </a>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onRerun}
              disabled={busy || !terminal}
              className="rounded border border-dark-border px-3 py-1.5 text-sm text-text-primary hover:bg-dark-lighter disabled:opacity-50"
            >
              Re-run
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="rounded border border-red-700/50 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/20 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6" dir="auto">
        {status === "queued" || status === "processing" ? (
          <p className="text-sm text-blue-300">Summarizing\u2026 this usually takes 20\u201360 seconds.</p>
        ) : status === "failed" ? (
          <div className="rounded border border-red-700/50 bg-red-900/20 p-4 text-sm text-red-200">
            <strong>Failed:</strong> {listItem?.errorMessage || "unknown error"}
          </div>
        ) : summary ? (
          <article className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.markdown}</ReactMarkdown>
          </article>
        ) : (
          <p className="text-sm text-text-muted">No content.</p>
        )}
      </div>
    </div>
  );
}
