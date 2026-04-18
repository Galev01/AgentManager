"use client";
import { useTransition } from "react";
import type {
  ReviewSeverity,
  ReviewTriageState,
} from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";
import { SeverityBadge } from "./severity-badge";
import { TriageBadge } from "./triage-badge";

type Action = { label: string; next: ReviewTriageState; primary?: boolean };

function actionsFor(
  severity: ReviewSeverity,
  triageState: ReviewTriageState
): Action[] {
  if (triageState === "new") {
    if (severity === "critical" || severity === "high") {
      return [
        { label: "Investigate now", next: "needs_attention", primary: true },
        { label: "Mark actionable", next: "actionable" },
        { label: "Dismiss", next: "dismissed" },
      ];
    }
    return [
      { label: "Mark actionable", next: "actionable", primary: true },
      { label: "Mark needs attention", next: "needs_attention" },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  if (triageState === "needs_attention") {
    return [
      { label: "Mark resolved", next: "resolved", primary: true },
      { label: "Mark actionable", next: "actionable" },
    ];
  }
  if (triageState === "actionable") {
    return [
      { label: "Mark resolved", next: "resolved", primary: true },
      { label: "Dismiss", next: "dismissed" },
    ];
  }
  return [{ label: "Reopen", next: "new", primary: true }];
}

function recommendationCopy(
  severity: ReviewSeverity,
  triageState: ReviewTriageState
): string {
  if (triageState !== "new") {
    return `This review is in "${triageState.replace("_", " ")}". Update its state when the situation changes.`;
  }
  if (severity === "critical")
    return "Critical findings detected — investigate immediately and triage to needs attention or actionable.";
  if (severity === "high")
    return "At least one high-impact finding — investigate and pick a triage state.";
  if (severity === "medium")
    return "Medium-impact findings — decide whether this is worth a follow-up.";
  if (severity === "low")
    return "Low-impact findings — consider dismissing or batching.";
  return "No actionable findings — likely safe to dismiss.";
}

export function RecommendedActionPanel({
  projectId,
  reportDate,
  severity,
  triageState,
}: {
  projectId: string;
  reportDate: string;
  severity: ReviewSeverity;
  triageState: ReviewTriageState;
}) {
  const [pending, startTransition] = useTransition();
  const actions = actionsFor(severity, triageState);
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-zinc-500">
          Recommended action
        </span>
        <SeverityBadge severity={severity} />
        <TriageBadge state={triageState} />
      </div>
      <p className="mt-2 text-sm text-zinc-300">
        {recommendationCopy(severity, triageState)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.next}
            disabled={pending}
            onClick={() =>
              startTransition(() =>
                setTriageAction(projectId, reportDate, a.next)
              )
            }
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              a.primary
                ? "bg-primary/20 text-primary hover:bg-primary/30"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            } disabled:opacity-50`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
