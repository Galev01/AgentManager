import { notFound } from "next/navigation";
import type { YoutubeSummaryMeta } from "@openclaw-manager/types";
import { getYoutubeSummary } from "@/lib/bridge-client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { YoutubeDetailTabs } from "./YoutubeDetailTabs";
import { RebuildMenu } from "./RebuildMenu";
import { requirePermission } from "@/lib/auth/current-user";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const dynamic = "force-dynamic";

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "\u2014";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

export default async function YoutubeDetailPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  await requirePermission("youtube.view");
  const { videoId } = await params;
  if (!VIDEO_ID_RE.test(videoId)) {
    notFound();
  }

  let meta: YoutubeSummaryMeta | null = null;
  let markdown = "";
  try {
    const result = await getYoutubeSummary(videoId);
    meta = result.meta;
    markdown = result.markdown ?? "";
  } catch {
    meta = null;
    markdown = "";
  }

  const fallbackUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const title = meta?.title || videoId;
  const channel = meta?.channel || "";
  const duration = formatDuration(meta?.durationSeconds);
  const description = channel ? `${channel} \u00b7 ${duration}` : duration;
  const url = meta?.url || fallbackUrl;

  return (
    <AppShell title="YouTube">
      <div className="content">
        <PageHeader
          title={title}
          description={description}
          actions={<RebuildMenu videoId={videoId} url={url} />}
        />
        <YoutubeDetailTabs
          videoId={videoId}
          initialMeta={meta}
          initialMarkdown={markdown}
        />
      </div>
    </AppShell>
  );
}
