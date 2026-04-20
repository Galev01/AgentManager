"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { YoutubeSummaryMeta } from "@openclaw-manager/types";
import { Card, EmptyState, KV, type KVItem } from "@/components/ui";

type Props = {
  videoId: string;
  initialMeta: YoutubeSummaryMeta | null;
  initialMarkdown: string;
};

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export function SummaryTab({ videoId, initialMeta, initialMarkdown }: Props) {
  const url =
    initialMeta?.url || `https://www.youtube.com/watch?v=${videoId}`;

  const items: KVItem[] = [
    { label: "Title", value: initialMeta?.title || videoId },
    { label: "Channel", value: initialMeta?.channel || "\u2014" },
    { label: "Duration", value: formatDuration(initialMeta?.durationSeconds) },
    {
      label: "URL",
      value: (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          Open on YouTube
        </a>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div style={{ padding: "14px 16px" }}>
          <KV items={items} />
        </div>
      </Card>
      <Card>
        <div style={{ padding: "14px 16px" }} dir="auto">
          {initialMarkdown ? (
            <article className="prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {initialMarkdown}
              </ReactMarkdown>
            </article>
          ) : (
            <EmptyState
              title="No summary yet"
              description="Use Rebuild \u2192 Summary to generate one."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
