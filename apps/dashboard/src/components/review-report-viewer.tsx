"use client";
import { useTransition } from "react";
import type { ReviewIdea, ReviewIdeaStatus } from "@openclaw-manager/types";
import { setIdeaStatusAction } from "@/app/reviews/[projectId]/idea-actions";

const STATUSES: ReviewIdeaStatus[] = ["pending", "accepted", "rejected", "deferred"];

function statusClass(s: ReviewIdeaStatus): string {
  return {
    pending: "bg-zinc-700/40 text-zinc-300",
    accepted: "bg-emerald-600/30 text-emerald-200",
    rejected: "bg-red-600/30 text-red-200",
    deferred: "bg-amber-600/30 text-amber-200",
  }[s];
}

export function ReviewReportViewer({
  projectId,
  markdown,
  ideas,
}: {
  projectId: string;
  markdown: string;
  ideas: ReviewIdea[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <pre className="col-span-1 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-200 lg:col-span-3">
        {markdown}
      </pre>
      <div className="col-span-1 space-y-3 lg:col-span-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Ideas ({ideas.length})
        </h2>
        {ideas.map((idea) => (
          <div key={idea.id} className="rounded border border-zinc-800 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-zinc-100">{idea.title}</div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                {idea.category.replace("_", " ")}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Impact: {idea.impact} · Effort: {idea.effort}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={pending || idea.status === s}
                  onClick={() =>
                    startTransition(() => setIdeaStatusAction(projectId, idea.id, s))
                  }
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    idea.status === s ? statusClass(s) : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  } disabled:opacity-50`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
