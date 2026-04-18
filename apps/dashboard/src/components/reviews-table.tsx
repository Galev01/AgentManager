"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { ReviewProject, ReviewerWorkerState } from "@openclaw-manager/types";
import {
  ackAction,
  addProjectAction,
  runNowAction,
  scanAction,
  toggleEnabledAction,
} from "@/app/reviews/actions";

function relative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  const sign = diff >= 0 ? "ago" : "in";
  if (abs < 60000) return "just now";
  if (mins < 60) return `${sign} ${mins}m`;
  if (hours < 48) return `${sign} ${hours}h`;
  return `${sign} ${days}d`;
}

function StatusBadge({ status, missing }: { status: ReviewProject["status"]; missing?: boolean }) {
  if (missing) return <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">missing</span>;
  const map: Record<ReviewProject["status"], string> = {
    idle: "bg-zinc-500/10 text-zinc-300",
    queued: "bg-sky-500/10 text-sky-300",
    running: "bg-emerald-500/10 text-emerald-300",
    awaiting_ack: "bg-amber-500/10 text-amber-300",
    skipped: "bg-zinc-700/10 text-zinc-400",
    failed: "bg-red-500/10 text-red-400",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${map[status]}`}>{status.replace("_", " ")}</span>;
}

export function ReviewsTable({
  projects,
  worker,
  scanRoots,
}: {
  projects: ReviewProject[];
  worker: ReviewerWorkerState;
  scanRoots: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          <div>
            Worker:{" "}
            {worker.current
              ? <span className="text-emerald-300">running {worker.current}</span>
              : <span>idle</span>}
            {worker.queue.length > 0 && (
              <span className="ml-2 text-zinc-500">queued: {worker.queue.join(", ")}</span>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              disabled={pending}
              onClick={() => {
                setShowAdd((v) => !v);
                setAddError(null);
              }}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {showAdd ? "Cancel" : "Add project"}
            </button>
            <button
              disabled={pending}
              onClick={() => startTransition(() => scanAction())}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Rescan projects
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-500">
          <span>Scan roots:</span>
          {scanRoots.length === 0 ? (
            <span className="text-zinc-600">none configured</span>
          ) : (
            scanRoots.map((r) => (
              <span
                key={r}
                className="rounded bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
              >
                {r}
              </span>
            ))
          )}
        </div>
        {showAdd && (
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="Absolute path (e.g. C:\Users\you\code\my-repo)"
              className="flex-1 rounded bg-zinc-950 px-2 py-1 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              disabled={pending || newPath.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  const result = await addProjectAction(newPath.trim());
                  if (result.ok) {
                    setNewPath("");
                    setShowAdd(false);
                    setAddError(null);
                  } else {
                    setAddError(result.error);
                  }
                })
              }
              className="rounded bg-primary/20 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
        {addError && (
          <p className="text-xs text-red-300">Couldn't add: {addError}</p>
        )}
      </div>
      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Last run</th>
              <th className="px-4 py-2">Last error</th>
              <th className="px-4 py-2">Eligible</th>
              <th className="px-4 py-2">Enabled</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-4 py-2">
                  <Link href={`/reviews/${p.id}`} className="font-medium text-zinc-100 hover:text-sky-300">
                    {p.name}
                  </Link>
                  <div className="text-xs text-zinc-500">{p.path}</div>
                </td>
                <td className="px-4 py-2"><StatusBadge status={p.status} missing={p.missing} /></td>
                <td className="px-4 py-2 text-zinc-400">
                  <div>{relative(p.lastRunAt)}</div>
                  {p.lastReportDate && (
                    <div className="text-[10px] text-zinc-500">report {p.lastReportDate}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-red-300/80 max-w-[260px] truncate" title={p.lastError ?? undefined}>
                  {p.status === "failed" && p.lastError ? p.lastError : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-400">
                  {p.eligibleAt ? relative(p.eligibleAt) : p.status === "awaiting_ack" ? "awaiting ack" : "now"}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    disabled={pending}
                    onChange={(e) =>
                      startTransition(() => toggleEnabledAction(p.id, e.target.checked))
                    }
                  />
                </td>
                <td className="px-4 py-2 text-right space-x-2">
                  <button
                    disabled={pending || p.missing || p.status === "running" || p.status === "queued"}
                    onClick={() => startTransition(() => runNowAction(p.id))}
                    className="rounded bg-sky-600/20 px-2 py-1 text-xs text-sky-300 hover:bg-sky-600/30 disabled:opacity-40"
                  >
                    Run now
                  </button>
                  {p.status === "awaiting_ack" && (
                    <button
                      disabled={pending}
                      onClick={() => startTransition(() => ackAction(p.id))}
                      className="rounded bg-amber-600/20 px-2 py-1 text-xs text-amber-300 hover:bg-amber-600/30 disabled:opacity-40"
                    >
                      Acknowledge
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
