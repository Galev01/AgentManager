import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReviewReportViewer } from "@/components/review-report-viewer";
import { RecommendedActionPanel } from "@/components/recommended-action-panel";
import { SeverityBadge } from "@/components/severity-badge";
import { TriageBadge } from "@/components/triage-badge";
import {
  getReviewProjects,
  getReviewReport,
  getReviewReports,
} from "@/lib/bridge-client";
import { ackAction, runNowAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ date?: string }>;
};

export default async function ReviewDetailPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const { date } = await searchParams;
  let projectName = projectId;
  let status: string = "idle";
  let missing = false;
  let awaitingAck = false;
  try {
    const { projects } = await getReviewProjects();
    const p = projects.find((x) => x.id === projectId);
    if (p) {
      projectName = p.name;
      status = p.status;
      missing = !!p.missing;
      awaitingAck = p.status === "awaiting_ack";
    }
  } catch { /* degraded */ }

  let reports: Awaited<ReturnType<typeof getReviewReports>>["reports"] = [];
  try {
    reports = (await getReviewReports(projectId)).reports;
  } catch { /* empty */ }

  const selectedDate = date || reports[0]?.reportDate;
  const selectedReport = selectedDate
    ? reports.find((r) => r.reportDate === selectedDate)
    : undefined;
  let markdown = "";
  let ideas: Awaited<ReturnType<typeof getReviewReport>>["ideas"] = [];
  if (selectedDate) {
    try {
      const r = await getReviewReport(projectId, selectedDate);
      markdown = r.markdown;
      ideas = r.ideas;
    } catch { /* empty */ }
  }

  return (
    <AppShell title={projectName}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← All reviews
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">{projectName}</h1>
            <p className="mt-1 text-sm text-zinc-500">status: {status.replace("_", " ")}{missing ? " · missing" : ""}</p>
          </div>
          <div className="flex gap-2">
            <form action={runNowAction.bind(null, projectId)}>
              <button
                disabled={missing || status === "running" || status === "queued"}
                className="rounded bg-sky-600/20 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-600/30 disabled:opacity-40"
              >
                Run now
              </button>
            </form>
            {awaitingAck && (
              <form action={ackAction.bind(null, projectId)}>
                <button className="rounded bg-amber-600/20 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-600/30">
                  Acknowledge
                </button>
              </form>
            )}
          </div>
        </div>

        {selectedReport && (
          <RecommendedActionPanel
            projectId={projectId}
            reportDate={selectedReport.reportDate}
            severity={selectedReport.severity}
            triageState={selectedReport.triageState}
          />
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="col-span-1 space-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">History</h2>
            {reports.length === 0 && <p className="text-xs text-zinc-500">No reports yet.</p>}
            {reports.map((r) => (
              <Link
                key={r.reportDate}
                href={`/reviews/${projectId}?date=${r.reportDate}`}
                className={`block rounded px-2 py-1.5 text-sm ${
                  r.reportDate === selectedDate
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{r.reportDate}</span>
                  <SeverityBadge severity={r.severity} />
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                  <TriageBadge state={r.triageState} />
                  <span>· {r.ideasCount} ideas</span>
                </div>
              </Link>
            ))}
          </aside>
          <div className="col-span-1 lg:col-span-3">
            {markdown ? (
              <ReviewReportViewer projectId={projectId} markdown={markdown} ideas={ideas} />
            ) : (
              <p className="text-sm text-zinc-500">Select a report to view it.</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
