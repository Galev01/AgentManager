"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryEvent, TelemetryQueryResponse } from "@openclaw-manager/types";

const POLL_MS = 3000;
const PAGE_SIZE = 200;

type Filters = {
  feature: string;
  action: string;
  outcome: string;
  actor: string;
  traceId: string;
  q: string;
};

const EMPTY: Filters = { feature: "", action: "", outcome: "", actor: "", traceId: "", q: "" };

const INPUT_CLASS =
  "rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none";

const BUTTON_PRIMARY =
  "rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition";

const BUTTON_GHOST =
  "rounded border border-zinc-600 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition";

function toQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString() ? `?${p.toString()}` : "";
}

function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { hour12: false });
  } catch {
    return iso;
  }
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  const map: Record<string, string> = {
    invoked: "bg-zinc-700/60 text-zinc-300",
    succeeded: "bg-green-900/40 text-green-300",
    failed: "bg-red-900/40 text-red-300",
  };
  const klass = map[outcome] ?? "bg-zinc-700/60 text-zinc-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${klass}`}>
      {outcome}
    </span>
  );
}

export function LogCenterTable(): React.ReactElement {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const liveSinceRef = useRef<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const cursor = reset ? null : nextCursorRef.current;
      const qs = toQuery(filters, {
        limit: String(PAGE_SIZE),
        ...(cursor ? { until: cursor } : {}),
      });
      const res = await fetch(`/api/telemetry/actions${qs}`);
      if (!res.ok) return;
      const body = (await res.json()) as TelemetryQueryResponse;
      setEvents((prev) => (reset ? body.events : [...prev, ...body.events]));
      setNextCursor(body.nextCursor);
      nextCursorRef.current = body.nextCursor;
      if (reset) {
        liveSinceRef.current = body.prevCursor;
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      const since = liveSinceRef.current;
      const qs = toQuery(filters, {
        limit: String(PAGE_SIZE),
        ...(since ? { since } : {}),
      });
      const res = await fetch(`/api/telemetry/actions${qs}`);
      if (!res.ok) return;
      const body = (await res.json()) as TelemetryQueryResponse;
      if (body.events.length > 0) {
        setEvents((prev) => {
          if (since) return [...body.events, ...prev];
          return body.events;
        });
        liveSinceRef.current = body.prevCursor;
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, filters]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((prev) => ({ ...prev, [k]: e.target.value }));

  const filtersActive = Object.values(filters).some((v) => v);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
        <input placeholder="feature" value={filters.feature} onChange={set("feature")} className={`${INPUT_CLASS} w-40`} />
        <input placeholder="action" value={filters.action} onChange={set("action")} className={`${INPUT_CLASS} w-40`} />
        <select value={filters.outcome} onChange={set("outcome")} className={`${INPUT_CLASS} w-40`}>
          <option value="">outcome (any)</option>
          <option value="invoked">invoked</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
        </select>
        <input placeholder="actor" value={filters.actor} onChange={set("actor")} className={`${INPUT_CLASS} w-32`} />
        <input placeholder="traceId" value={filters.traceId} onChange={set("traceId")} className={`${INPUT_CLASS} w-44`} />
        <input placeholder="search" value={filters.q} onChange={set("q")} className={`${INPUT_CLASS} flex-1 min-w-[160px]`} />
        <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-4 w-4 accent-blue-500" />
          Live
        </label>
        <button onClick={() => void load(true)} disabled={loading} className={BUTTON_PRIMARY}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        {filtersActive && (
          <button onClick={() => setFilters(EMPTY)} className={BUTTON_GHOST}>
            Clear
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Timestamp</th>
              <th className="px-3 py-2 text-left font-semibold">Event</th>
              <th className="px-3 py-2 text-left font-semibold">Actor</th>
              <th className="px-3 py-2 text-left font-semibold">Target</th>
              <th className="px-3 py-2 text-left font-semibold">Outcome</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-700">
            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No events.
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const isOpen = expanded === ev.eventId;
              return (
                <Fragment key={ev.eventId}>
                  <tr className="hover:bg-zinc-900/40">
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-zinc-400">{fmtTs(ev.ts)}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-zinc-200">
                      <span className="text-zinc-400">{ev.feature}.</span>
                      <span className="text-zinc-100">{ev.action}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-zinc-300">{ev.actor.id}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-zinc-400">{ev.target?.id ?? ""}</td>
                    <td className="px-3 py-1.5">
                      <OutcomeBadge outcome={ev.outcome} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        onClick={() => setExpanded((x) => (x === ev.eventId ? null : ev.eventId))}
                        className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-900/60">
                      <td colSpan={6} className="px-3 py-3">
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-[11px] text-zinc-300">
                          {JSON.stringify(ev, null, 2)}
                        </pre>
                        {ev.traceId && (
                          <button
                            onClick={() => setFilters({ ...EMPTY, traceId: ev.traceId! })}
                            className={`${BUTTON_GHOST} mt-2`}
                          >
                            Filter by traceId
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button onClick={() => void load(false)} disabled={loading} className={BUTTON_GHOST}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
