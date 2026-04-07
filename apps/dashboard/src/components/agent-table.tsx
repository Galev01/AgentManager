"use client";

import { useState } from "react";
import Link from "next/link";
import type { Agent } from "@openclaw-manager/types";

export function AgentTable({ initial }: { initial: Agent[] }) {
  const [agents, setAgents] = useState<Agent[]>(initial);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), model: model.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent");
      }
      const newAgent: Agent = await res.json();
      setAgents((prev) => [...prev, newAgent]);
      setName("");
      setModel("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(agentName: string) {
    if (!confirm(`Delete agent "${agentName}"? This cannot be undone.`)) return;
    setAgents((prev) => prev.filter((a) => a.name !== agentName));
    try {
      const res = await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agentName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete agent");
      }
    } catch (err: any) {
      setError(err.message);
      // Reload to restore state on failure
      const res = await fetch("/api/agents");
      if (res.ok) setAgents(await res.json());
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

      {/* Agents table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {agents.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No agents configured.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Tools</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {agents.map((a) => (
                <tr key={a.name} className="hover:bg-zinc-700/30 transition">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-zinc-300">{a.model || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {a.tools && a.tools.length > 0 ? a.tools.length : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link
                      href={`/agents/${encodeURIComponent(a.name)}`}
                      className="rounded px-3 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleDelete(a.name)}
                      className="rounded px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/30 hover:text-red-300 transition"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">Create Agent</h3>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Name (required)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 min-w-[180px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Model (optional)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={adding || !name.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {adding ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
