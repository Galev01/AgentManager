"use client";

import { useState } from "react";
import type { Channel } from "@openclaw-manager/types";

function formatTimestamp(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function StatusBadge({ status }: { status: Channel["status"] }) {
  const config = {
    connected: { dot: "bg-green-400", text: "text-green-300", bg: "bg-green-900/40", label: "Connected" },
    disconnected: { dot: "bg-zinc-500", text: "text-zinc-400", bg: "bg-zinc-700/60", label: "Disconnected" },
    error: { dot: "bg-yellow-400", text: "text-yellow-300", bg: "bg-yellow-900/40", label: "Error" },
  } as const;

  const c = config[status] ?? config.disconnected;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function ChannelCards({ initial }: { initial: Channel[] }) {
  const [channels, setChannels] = useState<Channel[]>(initial);
  const [loggingOut, setLoggingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout(name: string) {
    if (!confirm(`Logout channel "${name}"? This will disconnect the channel.`)) return;
    setLoggingOut(name);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "logout" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to logout channel");
      }
      // Refresh channel list
      const refreshRes = await fetch("/api/channels");
      if (refreshRes.ok) setChannels(await refreshRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoggingOut(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-6 py-16 text-center">
          <p className="text-sm text-zinc-400">No channels configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((ch) => (
            <div
              key={ch.name}
              className="flex flex-col rounded-lg border border-zinc-700 bg-zinc-800 p-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-zinc-100">{ch.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-500 uppercase tracking-wide">{ch.type}</p>
                </div>
                <StatusBadge status={ch.status} />
              </div>

              {/* Last activity */}
              <div className="text-xs text-zinc-500">
                <span className="text-zinc-400">Last activity:</span>{" "}
                {formatTimestamp(ch.lastActivityAt)}
              </div>

              {/* Account info */}
              {ch.accountInfo && Object.keys(ch.accountInfo).length > 0 && (
                <div className="rounded border border-zinc-700 bg-zinc-900/50 p-3 space-y-1">
                  {Object.entries(ch.accountInfo).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 text-xs">
                      <span className="text-zinc-500 shrink-0">{k}</span>
                      <span className="text-zinc-300 truncate text-right">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Logout button */}
              <div className="mt-auto pt-1">
                <button
                  onClick={() => handleLogout(ch.name)}
                  disabled={loggingOut === ch.name}
                  className="w-full rounded px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-800/50 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loggingOut === ch.name ? "Logging out…" : "Logout"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
