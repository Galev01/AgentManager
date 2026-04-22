"use client";

import { useState } from "react";
import type { CronJob } from "@openclaw-manager/types";
import { ScheduleBuilder } from "./schedule-builder";

function formatTimestamp(ts?: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function StatusBadge({ status }: { status?: string }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-green-900/40 text-green-300"
          : "bg-zinc-700/60 text-zinc-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-zinc-500"}`}
      />
      {isActive ? "Active" : "Paused"}
    </span>
  );
}

export function CronTable({ initial }: { initial: CronJob[] }) {
  const [jobs, setJobs] = useState<CronJob[]>(initial);
  const [schedule, setSchedule] = useState("0 * * * *");
  const [command, setCommand] = useState("");
  const [agentName, setAgentName] = useState("");
  const [jobName, setJobName] = useState("");
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!schedule.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: schedule.trim(),
          command: command.trim() || undefined,
          agentName: agentName.trim() || undefined,
          name: jobName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add cron job");
      }
      const newJob: CronJob = await res.json();
      setJobs((prev) => [...prev, newJob]);
      setCommand("");
      setAgentName("");
      setJobName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRun(id: string) {
    setRunning(id);
    setError(null);
    try {
      const res = await fetch(`/api/cron/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to run cron job");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete cron job "${label}"? This cannot be undone.`)) return;
    setJobs((prev) => prev.filter((j) => j.id !== id));
    try {
      const res = await fetch("/api/cron", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete cron job");
      }
    } catch (err: any) {
      setError(err.message);
      const res = await fetch("/api/cron");
      if (res.ok) setJobs(await res.json());
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

      {/* Cron jobs table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {jobs.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No cron jobs configured.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Name / ID</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Run</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {jobs.map((job) => {
                const label = job.name || job.id;
                return (
                  <tr key={job.id} className="hover:bg-zinc-700/30 transition">
                    <td className="px-4 py-3">
                      <div className="font-medium">{job.name || <span className="text-zinc-400">—</span>}</div>
                      <div className="text-xs text-zinc-500 font-mono">{job.id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300">{job.schedule}</td>
                    <td className="px-4 py-3 text-zinc-400">{job.agentName || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {formatTimestamp(job.lastRunAt)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleRun(job.id)}
                        disabled={running === job.id}
                        className="rounded px-3 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {running === job.id ? "Running…" : "Run Now"}
                      </button>
                      <button
                        onClick={() => handleDelete(job.id, label)}
                        className="rounded px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/30 hover:text-red-300 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add cron job form */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-100">Add Cron Job</h3>

        <ScheduleBuilder value={schedule} onChange={setSchedule} />

        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Name (optional)"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Command (optional)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[200px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Agent name (optional)"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !schedule.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {adding ? "Adding…" : "Add Job"}
          </button>
        </div>
      </div>
    </div>
  );
}
