import type { ReviewSeverity } from "@openclaw-manager/types";

const STYLE: Record<ReviewSeverity, string> = {
  critical: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  high: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  low: "bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30",
  info: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30",
};

const TOOLTIP: Record<ReviewSeverity, string> = {
  critical: "3+ high-impact findings — review urgently",
  high: "Contains at least one high-impact finding",
  medium: "Medium-impact findings only",
  low: "Low-impact findings only",
  info: "No actionable findings — informational",
};

export function SeverityBadge({ severity }: { severity: ReviewSeverity }) {
  return (
    <span
      title={TOOLTIP[severity]}
      className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLE[severity]}`}
    >
      {severity}
    </span>
  );
}
