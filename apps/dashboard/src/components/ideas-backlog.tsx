"use client";
import Link from "next/link";
import { useTransition } from "react";
import type {
  ReviewIdea,
  ReviewIdeaStatus,
} from "@openclaw-manager/types";
import { setIdeaStatusAction } from "@/app/reviews/[projectId]/idea-actions";

const STATUSES: ReviewIdeaStatus[] = ["pending", "accepted", "rejected", "deferred"];

export function IdeasBacklog({ ideas }: { ideas: ReviewIdea[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-4 py-2">Project</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Impact</th>
            <th className="px-4 py-2">Effort</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => (
            <tr key={idea.id} className="border-t border-zinc-800 align-top">
              <td className="px-4 py-2">
                <Link href={`/reviews/${idea.projectId}`} className="text-sky-300 hover:text-sky-200">
                  {idea.projectName}
                </Link>
              </td>
              <td className="px-4 py-2 text-zinc-400">{idea.reportDate}</td>
              <td className="px-4 py-2 text-zinc-400">{idea.category.replace("_", " ")}</td>
              <td className="px-4 py-2">
                <details>
                  <summary className="cursor-pointer text-zinc-100">{idea.title}</summary>
                  <div className="mt-1 space-y-1 text-xs text-zinc-400">
                    <p><span className="text-zinc-500">Problem:</span> {idea.problem}</p>
                    <p><span className="text-zinc-500">Solution:</span> {idea.solution}</p>
                  </div>
                </details>
              </td>
              <td className="px-4 py-2 text-zinc-300">{idea.impact}</td>
              <td className="px-4 py-2 text-zinc-300">{idea.effort}</td>
              <td className="px-4 py-2">
                <div className="flex flex-wrap gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      disabled={pending || idea.status === s}
                      onClick={() =>
                        startTransition(() =>
                          setIdeaStatusAction(idea.projectId, idea.id, s)
                        )
                      }
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        idea.status === s
                          ? "bg-zinc-700 text-zinc-100"
                          : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                      } disabled:opacity-50`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
