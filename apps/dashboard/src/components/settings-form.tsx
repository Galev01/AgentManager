"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeSettings } from "@openclaw-manager/types";
import { msToMinutes, minutesToMs, formatTimestamp } from "@/lib/format";

export function SettingsForm({ settings }: { settings: RuntimeSettings }) {
  const router = useRouter();
  const [relayTarget, setRelayTarget] = useState(settings.relayTarget);
  const [delayMin, setDelayMin] = useState(String(msToMinutes(settings.delayMs)));
  const [summaryDelayMin, setSummaryDelayMin] = useState(String(msToMinutes(settings.summaryDelayMs)));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relayTarget, delayMs: minutesToMs(Number(delayMin) || 0), summaryDelayMs: minutesToMs(Number(summaryDelayMin) || 0) }),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch {} finally { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm text-text-gray" htmlFor="relayTarget">Relay Target (phone number)</label>
        <input id="relayTarget" type="text" value={relayTarget} onChange={(e) => setRelayTarget(e.target.value)}
          className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary placeholder-text-muted outline-none transition focus:border-primary" placeholder="+972..." />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm text-text-gray" htmlFor="delayMin">Cold Start Delay (minutes)</label>
          <input id="delayMin" type="number" min="0" value={delayMin} onChange={(e) => setDelayMin(e.target.value)}
            className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none transition focus:border-primary" />
        </div>
        <div>
          <label className="mb-2 block text-sm text-text-gray" htmlFor="summaryDelayMin">Summary Delay (minutes)</label>
          <input id="summaryDelayMin" type="number" min="0" value={summaryDelayMin} onChange={(e) => setSummaryDelayMin(e.target.value)}
            className="block w-full rounded border border-dark-border bg-dark px-5 py-3 text-base text-text-primary outline-none transition focus:border-primary" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={loading}
          className="inline-flex items-center gap-2 rounded bg-primary py-3 px-6 font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          {loading && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          Save Settings
        </button>
        {saved && <span className="text-sm text-success">Saved!</span>}
      </div>
      <p className="text-xs text-text-muted">Last updated: {formatTimestamp(settings.updatedAt)} by {settings.updatedBy}</p>
    </form>
  );
}
