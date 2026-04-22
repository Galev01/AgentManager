"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type {
  ReviewInboxItem,
  ReviewTriageState,
} from "@openclaw-manager/types";
import { setTriageAction } from "@/app/reviews/actions";
import { SeverityBadge } from "./severity-badge";
import { TriageBadge } from "./triage-badge";
import { useTelemetry } from "@/lib/telemetry";

const TRIAGE_FILTERS: { value: ReviewTriageState; label: string }[] = [
  { value: "new", label: "New" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "actionable", label: "Actionable" },
  { value: "dismissed", label: "Dismissed" },
  { value: "resolved", label: "Resolved" },
];

export function InboxTable({ items }: { items: ReviewInboxItem[] }) {
  const [pending, startTransition] = useTransition();
  const [activeFilters, setActiveFilters] = useState<Set<ReviewTriageState>>(
    new Set(["new", "needs_attention", "actionable"])
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { logAction, trackOperation } = useTelemetry();

  const visible = items.filter((i) => activeFilters.has(i.triageState));
  const itemKey = (i: ReviewInboxItem) => `${i.projectId}::${i.reportDate}`;

  function toggleFilter(state: ReviewTriageState) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      logAction({
        feature: "reviews.inbox",
        action: "filter_applied",
        context: { status: Array.from(next).join(","), severity: "" },
      });
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(itemKey)));
  }

  function bulkSet(triageState: ReviewTriageState) {
    const targets = visible.filter((i) => selected.has(itemKey(i)));
    // Use the first target's projectId as representative (all targets may span projects)
    const projectId = targets[0]?.projectId ?? "";
    startTransition(async () => {
      await trackOperation(
        "reviews.inbox",
        "bulk_triaged",
        async () => {
          for (const t of targets) {
            await setTriageAction(t.projectId, t.reportDate, triageState);
          }
        },
        { projectId, count: targets.length, decision: triageState },
      );
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">Filter:</span>
        {TRIAGE_FILTERS.map((f) => {
          const on = activeFilters.has(f.value);
          return (
            <button
              key={f.value}
              onClick={() => toggleFilter(f.value)}
              className={`rounded px-2 py-1 ${
                on
                  ? "bg-primary/20 text-primary"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-zinc-400">{selected.size} selected</span>
            <button
              disabled={pending}
              onClick={() => bulkSet("actionable")}
              className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              Bulk: actionable
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSet("dismissed")}
              className="rounded bg-zinc-700/40 px-2 py-1 text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50"
            >
              Bulk: dismiss
            </button>
            <button
              disabled={pending}
              onClick={() => bulkSet("resolved")}
              className="rounded bg-zinc-500/20 px-2 py-1 text-zinc-300 hover:bg-zinc-500/30 disabled:opacity-50"
            >
              Bulk: resolved
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
          No reviews match the current filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === visible.length && visible.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Triage</th>
                <th className="px-3 py-2">Ideas</th>
                <th className="px-3 py-2 text-right">Open</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const key = itemKey(i);
                const isSelected = selected.has(key);
                return (
                  <tr key={key} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(key);
                            else next.delete(key);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-zinc-200">{i.projectName}</td>
                    <td className="px-3 py-2 text-zinc-400">{i.reportDate}</td>
                    <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                    <td className="px-3 py-2"><TriageBadge state={i.triageState} /></td>
                    <td className="px-3 py-2 text-zinc-400">{i.ideasCount}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/reviews/${i.projectId}?date=${i.reportDate}`}
                        className="text-sky-300 hover:text-sky-200"
                        onClick={() =>
                          logAction({
                            feature: "reviews.inbox",
                            action: "item_opened",
                            target: { type: "review_item", id: i.reportDate },
                            context: { projectId: i.projectId, itemId: i.reportDate },
                          })
                        }
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
