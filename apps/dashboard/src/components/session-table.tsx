"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentSession } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";

type StatusFilter = "all" | "active" | "completed" | "aborted";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Aborted", value: "aborted" },
];

function StatusBadge({ status }: { status: AgentSession["status"] }) {
  const colors: Record<AgentSession["status"], string> = {
    active: "bg-green-900/50 text-green-300 border-green-700",
    completed: "bg-zinc-800 text-zinc-400 border-zinc-600",
    aborted: "bg-red-900/50 text-red-300 border-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export function SessionTable({ initial }: { initial: AgentSession[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AgentSession[]>(initial);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered =
    filter === "all" ? sessions : sessions.filter((s) => s.status === filter);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/agent-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create session");
      }
      const newSession: AgentSession = await res.json();
      setSessions((prev) => [newSession, ...prev]);
      router.push(`/sessions/${newSession.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                filter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {creating ? "Creating…" : "New Session"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No sessions found.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Messages</th>
                <th className="px-4 py-3">Tokens</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}`)}
                  className="cursor-pointer hover:bg-zinc-700/30 transition"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                    {s.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{s.agentName || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.messageCount ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.tokenUsage ? s.tokenUsage.total.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.createdAt ? timeAgo(s.createdAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.lastActivityAt ? timeAgo(s.lastActivityAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
