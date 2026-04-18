import { listYoutubeSummaries, listYoutubeJobs } from "@/lib/bridge-client";
import { SummaryListPane } from "@/components/youtube/SummaryListPane";
import { SummaryViewPane } from "@/components/youtube/SummaryViewPane";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ v?: string }>;
};

export default async function YoutubePage({ searchParams }: Props) {
  const { v: selectedVideoId } = await searchParams;
  let initialSummaries: any[] = [];
  let initialJobs: any[] = [];
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
    <div className="grid h-[calc(100vh-var(--header-height))] grid-cols-1 lg:grid-cols-[400px_1fr]">
      <SummaryListPane
        initialSummaries={initialSummaries}
        initialJobs={initialJobs}
        selectedVideoId={selectedVideoId ?? null}
      />
      <SummaryViewPane selectedVideoId={selectedVideoId ?? null} />
    </div>
  );
}
