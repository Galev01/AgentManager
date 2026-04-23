import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { IdeasBacklog } from "@/components/ideas-backlog";
import { getReviewIdeas } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
  ReviewIdeaImpact,
  ReviewIdeaEffort,
  ReviewIdeaCategory,
} from "@openclaw-manager/types";

export const metadata = { title: "Idea backlog" };
export const dynamic = "force-dynamic";

type SP = Promise<{
  project?: string | string[];
  status?: string | string[];
  impact?: string | string[];
  effort?: string | string[];
  category?: string | string[];
}>;

function toArr(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v : [v];
}

export default async function IdeasPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("reviews.view");
  const sp = await searchParams;
  let ideas: ReviewIdea[] = [];
  try {
    const result = await getReviewIdeas({
      project: toArr(sp.project),
      status: toArr(sp.status) as ReviewIdeaStatus[] | undefined,
      impact: toArr(sp.impact) as ReviewIdeaImpact[] | undefined,
      effort: toArr(sp.effort) as ReviewIdeaEffort[] | undefined,
      category: toArr(sp.category) as ReviewIdeaCategory[] | undefined,
    });
    ideas = result.ideas;
  } catch { /* degraded */ }

  const hasActiveFilters = !!(sp.project || sp.status || sp.impact || sp.effort || sp.category);

  return (
    <AppShell title="Idea backlog">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← Reviews
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Idea backlog</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Every idea across every review. Set a status to triage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["pending", "accepted", "rejected", "deferred"] as const).map((s) => (
              <Link
                key={s}
                href={`/reviews/ideas?status=${s}`}
                className="rounded border border-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              >
                {s}
              </Link>
            ))}
            {hasActiveFilters && (
              <Link
                href="/reviews/ideas"
                className="rounded border border-zinc-800 px-2 py-1 text-zinc-500 hover:bg-zinc-800"
              >
                clear
              </Link>
            )}
          </div>
        </div>
        <IdeasBacklog ideas={ideas} />
      </div>
    </AppShell>
  );
}
