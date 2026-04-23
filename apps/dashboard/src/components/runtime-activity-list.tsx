import type { RuntimeActivityEvent } from "@openclaw-manager/types";

export function RuntimeActivityList({ events }: { events: RuntimeActivityEvent[] }) {
  if (events.length === 0) {
    return <div className="text-sm text-neutral-500">No recent activity.</div>;
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {events.map((e, i) => (
        <li
          key={`${e.at}-${i}`}
          className="flex gap-3 items-start border-b border-neutral-900 pb-1.5"
        >
          <span className="text-xs text-neutral-500 shrink-0 w-24">
            {new Date(e.at).toISOString().slice(11, 19)}
          </span>
          <span className="text-xs uppercase tracking-wide text-neutral-400 shrink-0 w-28">
            {e.eventKind}
          </span>
          <span
            className={`text-xs shrink-0 w-16 ${
              e.projectionMode === "exact"
                ? "text-emerald-400"
                : e.projectionMode === "partial"
                  ? "text-amber-400"
                  : "text-neutral-500"
            }`}
          >
            {e.projectionMode}
          </span>
          <span className="text-neutral-200 flex-1 truncate">{e.text ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}
