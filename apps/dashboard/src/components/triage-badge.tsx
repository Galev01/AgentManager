import type { ReviewTriageState } from "@openclaw-manager/types";

const STYLE: Record<ReviewTriageState, string> = {
  new: "bg-sky-500/15 text-sky-300",
  needs_attention: "bg-amber-500/15 text-amber-300",
  actionable: "bg-emerald-500/15 text-emerald-300",
  dismissed: "bg-zinc-700/15 text-zinc-500",
  resolved: "bg-zinc-500/15 text-zinc-400",
};

const LABEL: Record<ReviewTriageState, string> = {
  new: "new",
  needs_attention: "needs attention",
  actionable: "actionable",
  dismissed: "dismissed",
  resolved: "resolved",
};

export function TriageBadge({ state }: { state: ReviewTriageState }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${STYLE[state]}`}>
      {LABEL[state]}
    </span>
  );
}
