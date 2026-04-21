"use client";

import { useState } from "react";
import type { BrainInjectionPreview } from "@openclaw-manager/types";

const SOURCE_CLASS: Record<string, string> = {
  global: "bg-blue-900/40 text-blue-200 border-blue-800",
  person: "bg-emerald-900/40 text-emerald-200 border-emerald-800",
  curses: "bg-pink-900/40 text-pink-200 border-pink-800",
};

export function InjectionPreview({
  load,
}: {
  load: () => Promise<BrainInjectionPreview>;
}) {
  const [data, setData] = useState<BrainInjectionPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try { setData(await load()); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? "Loading…" : data ? "Refresh" : "Load preview"}
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
      {data && (
        <div className="space-y-2">
          {data.breakdown.map((c, i) => (
            <div key={i} className="rounded border border-zinc-700 bg-zinc-900 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${SOURCE_CLASS[c.source] ?? ""}`}>
                  {c.source}:{c.label}
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words text-xs text-zinc-300 font-mono leading-relaxed">{c.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
