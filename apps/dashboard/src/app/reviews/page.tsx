import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ReviewsTable } from "@/components/reviews-table";
import { ReviewsEmptyState } from "@/components/reviews-empty-state";
import { getReviewProjects } from "@/lib/bridge-client";
import type { ReviewProject, ReviewerWorkerState } from "@openclaw-manager/types";

export const metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  let projects: ReviewProject[] = [];
  let worker: ReviewerWorkerState = { current: null, queue: [] };
  let scanRoots: string[] = [];
  let error: string | null = null;
  try {
    const result = await getReviewProjects();
    projects = result.projects;
    worker = result.worker;
    scanRoots = result.scanRoots;
  } catch (e: any) {
    error = e?.message || "failed to load";
  }
  return (
    <AppShell title="Reviews">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Codebase Reviews</h1>
            <p className="mt-1 text-sm text-zinc-400">
              OpenClaw reviews each project once per day as a product manager. Acknowledge a report to unlock the next 24-hour window.
            </p>
          </div>
          <Link href="/reviews/ideas" className="text-sm text-sky-300 hover:text-sky-200">
            → Idea backlog
          </Link>
        </div>
        {error ? (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            Failed to load reviews: {error}
          </div>
        ) : projects.length === 0 ? (
          <ReviewsEmptyState />
        ) : (
          <ReviewsTable projects={projects} worker={worker} scanRoots={scanRoots} />
        )}
      </div>
    </AppShell>
  );
}
