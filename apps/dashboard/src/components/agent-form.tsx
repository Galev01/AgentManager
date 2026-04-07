"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@openclaw-manager/types";

export function AgentForm({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [model, setModel] = useState(agent.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.trim() || undefined, systemPrompt: systemPrompt || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save agent");
      }
      setSuccess("Agent saved successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete agent");
      }
      router.push("/agents");
    } catch (err: any) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {success && (
        <div className="rounded border border-green-700 bg-green-900/30 px-4 py-3 text-sm text-green-300">
          {success}
          <button
            onClick={() => setSuccess(null)}
            className="ml-3 text-green-400 hover:text-green-200"
          >
            Dismiss
          </button>
        </div>
      )}
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

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 space-y-5">
        {/* Model */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-300">Model</label>
          <input
            type="text"
            placeholder="e.g. claude-3-5-sonnet-20241022"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-zinc-300">System Prompt</label>
          <textarea
            rows={6}
            placeholder="Enter system prompt…"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="rounded bg-red-700/40 px-5 py-2 text-sm font-semibold text-red-300 hover:bg-red-700/70 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {deleting ? "Deleting…" : "Delete Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
