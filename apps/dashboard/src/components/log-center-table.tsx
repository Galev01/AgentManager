// apps/dashboard/src/components/log-center-table.tsx
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

function toQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString() ? `?${p.toString()}` : "";
}

export function LogCenterTable(): React.ReactElement {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const liveSinceRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    try {
      const qs = toQuery(filters, {
        limit: String(PAGE_SIZE),
        ...(reset ? {} : nextCursor ? { until: nextCursor } : {}),
      });
      const res = await fetch(`/api/telemetry/actions${qs}`);
      if (!res.ok) return;
      const body = (await res.json()) as TelemetryQueryResponse;
      setEvents((prev) => (reset ? body.events : [...prev, ...body.events]));
      setNextCursor(body.nextCursor);
      if (reset && body.prevCursor) {
        liveSinceRef.current = body.prevCursor;
      }
    } finally {
      setLoading(false);
    }
  }, [filters, nextCursor]);

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(async () => {
      if (!liveSinceRef.current) return;
      const qs = toQuery(filters, { since: liveSinceRef.current, limit: String(PAGE_SIZE) });
      const res = await fetch(`/api/telemetry/actions${qs}`);
      if (!res.ok) return;
      const body = (await res.json()) as TelemetryQueryResponse;
      if (body.events.length > 0) {
        setEvents((prev) => [...body.events, ...prev]);
        liveSinceRef.current = body.prevCursor;
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, filters]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="log-center">
      <div className="log-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="feature" value={filters.feature} onChange={set("feature")} />
        <input placeholder="action" value={filters.action} onChange={set("action")} />
        <select value={filters.outcome} onChange={set("outcome")}>
          <option value="">outcome (any)</option>
          <option value="invoked">invoked</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
        </select>
        <input placeholder="actor" value={filters.actor} onChange={set("actor")} />
        <input placeholder="traceId" value={filters.traceId} onChange={set("traceId")} />
        <input placeholder="search" value={filters.q} onChange={set("q")} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Live
        </label>
        <button onClick={() => void load(true)} disabled={loading}>
          Refresh
        </button>
      </div>

      <table className="log-table" style={{ width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>ts</th>
            <th style={{ textAlign: "left" }}>feature.action</th>
            <th style={{ textAlign: "left" }}>actor</th>
            <th style={{ textAlign: "left" }}>target</th>
            <th style={{ textAlign: "left" }}>outcome</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => (
            <Fragment key={ev.eventId}>
              <tr>
                <td>{ev.ts}</td>
                <td>
                  {ev.feature}.{ev.action}
                </td>
                <td>{ev.actor.id}</td>
                <td>{ev.target?.id ?? ""}</td>
                <td>{ev.outcome ?? ""}</td>
                <td>
                  <button onClick={() => setExpanded((x) => (x === ev.eventId ? null : ev.eventId))}>
                    {expanded === ev.eventId ? "−" : "+"}
                  </button>
                </td>
              </tr>
              {expanded === ev.eventId && (
                <tr>
                  <td colSpan={6}>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(ev, null, 2)}</pre>
                    {ev.traceId && (
                      <button onClick={() => setFilters({ ...EMPTY, traceId: ev.traceId! })}>
                        Filter by traceId
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {nextCursor && (
        <button onClick={() => void load(false)} disabled={loading} style={{ marginTop: 12 }}>
          Load more
        </button>
      )}
    </div>
  );
}
