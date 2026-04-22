"use client";
import { useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
      <div className="prose prose-invert prose-sm col-span-1 max-w-none overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4 lg:col-span-3 prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-strong:text-zinc-100 prose-a:text-sky-400 prose-code:text-amber-300 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-li:text-zinc-300 prose-hr:border-zinc-800 prose-blockquote:text-zinc-400 prose-blockquote:border-zinc-700 prose-th:text-zinc-100 prose-td:text-zinc-300">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </div>
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
