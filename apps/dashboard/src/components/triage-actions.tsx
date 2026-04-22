"use client";
import { useTransition } from "react";
import type { ReviewTriageState } from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";
import { useTelemetry } from "@/lib/telemetry";

const ALL_STATES: { value: ReviewTriageState; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "actionable", label: "Actionable" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

export function TriageActions({
  projectId,
  reportDate,
  current,
}: {
  projectId: string;
  reportDate: string;
  current: ReviewTriageState;
}) {
  const [pending, startTransition] = useTransition();
  const { trackOperation } = useTelemetry();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ALL_STATES.map((s) => {
        const isCurrent = s.value === current;
        return (
          <button
            key={s.value}
            disabled={pending || isCurrent}
            onClick={() =>
              startTransition(async () => {
                await trackOperation(
                  "reviews.inbox",
                  "item_triaged",
                  async () => {
                    await setTriageAction(projectId, reportDate, s.value);
                  },
                  { projectId, itemId: `${projectId}::${reportDate}`, decision: s.value },
                );
              })
            }
            className={`rounded px-2 py-1 text-xs ${
              isCurrent
                ? "bg-zinc-700 text-zinc-300 cursor-default"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            } disabled:opacity-50`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
