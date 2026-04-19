"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClaudeCodeSession } from "@openclaw-manager/types";

export function ClaudeCodeSessionsTable({
  sessions,
  pendingBySession,
}: {
  sessions: ClaudeCodeSession[];
  pendingBySession: Record<string, number>;
}) {
  const router = useRouter();
  const [showConnect, setShowConnect] = useState(false);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/claude-code/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  const active = sessions.filter((s) => s.state === "active");
  const ended = sessions.filter((s) => s.state === "ended");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {active.length} active session{active.length === 1 ? "" : "s"}
          {ended.length > 0 ? ` · ${ended.length} ended` : ""}
        </p>
        <button
          onClick={() => setShowConnect(true)}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Connect a new IDE
        </button>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-dark-border text-left text-text-muted">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Mode</th>
            <th className="py-2 pr-4">State</th>
            <th className="py-2 pr-4">Activity</th>
            <th className="py-2 pr-4">Pending</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const pendingCount = pendingBySession[s.id] ?? 0;
            return (
              <tr key={s.id} className="border-b border-dark-border/50 hover:bg-dark-lighter/30">
                <td className="py-3 pr-4">
                  <Link href={`/claude-code/${s.id}`} className="text-primary hover:underline">
                    {s.displayName}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <button
                    onClick={() => patch(s.id, { mode: s.mode === "agent" ? "manual" : "agent" })}
                    className={`rounded px-3 py-1 text-xs ${s.mode === "agent" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}
                  >
                    {s.mode}
                  </button>
                </td>
                <td className="py-3 pr-4 text-text-gray">{s.state}</td>
                <td className="py-3 pr-4 text-text-muted">
                  {s.messageCount} msgs · {relativeTime(s.lastActivityAt)}
                </td>
                <td className="py-3 pr-4">
                  {pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-2 rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      {pendingCount}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="py-3">
                  {s.state === "active" ? (
                    <button
                      onClick={() => patch(s.id, { state: "ended" })}
                      className="text-xs text-text-muted hover:text-red-400"
                    >
                      End
                    </button>
                  ) : (
                    <button
                      onClick={() => patch(s.id, { state: "active" })}
                      className="text-xs text-text-muted hover:text-green-400"
                    >
                      Resurrect
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-text-muted">
                No Claude Code sessions yet. Connect an IDE to start.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </div>
  );
}

function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  // Lazy import so the parent stays a stable "use client" boundary.
  // Dynamic require is avoided — a simple conditional render suffices once the modal body component exists.
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[80vh] w-[min(800px,90vw)] overflow-y-auto rounded bg-dark-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-sm text-text-muted">Connect modal will be wired up in Task 14.</p>
        <button onClick={onClose} className="rounded bg-dark-lighter px-4 py-2 text-sm">Close</button>
      </div>
    </div>
  );
}
