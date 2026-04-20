import { listYoutubeSummaries, listYoutubeJobs } from "@/lib/bridge-client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { YoutubeListView } from "@/components/youtube/YoutubeListView";
import type { YoutubeJob, YoutubeSummaryListItem } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function YoutubePage() {
  let initialSummaries: YoutubeSummaryListItem[] = [];
  let initialJobs: YoutubeJob[] = [];
  try {
    const s = await listYoutubeSummaries();
    initialSummaries = s.summaries;
  } catch {
    initialSummaries = [];
  }
  try {
    const j = await listYoutubeJobs();
    initialJobs = j.jobs;
  } catch {
    initialJobs = [];
  }

  return (
    <AppShell title="YouTube">
      <div className="content">
        <PageHeader
          title="YouTube"
          description="Paste URLs to summarize and explore videos."
        />
        <YoutubeListView
          initialSummaries={initialSummaries}
          initialJobs={initialJobs}
        />
      </div>
    </AppShell>
  );
}
