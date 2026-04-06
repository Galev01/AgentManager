"use client";

import { useState } from "react";
import type { RelayRecipient } from "@openclaw-manager/types";

export function RelayRecipientsForm({ initial }: { initial: RelayRecipient[] }) {
  const [recipients, setRecipients] = useState<RelayRecipient[]>(initial);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!phone.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), label: label.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add recipient");
      }
      const newRecipient: RelayRecipient = await res.json();
      setRecipients((prev) => [...prev, newRecipient]);
      setPhone("");
      setLabel("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch("/api/relay", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove recipient");
      }
    } catch (err: any) {
      setError(err.message);
      // Reload to restore state on failure
      const res = await fetch("/api/relay");
      if (res.ok) setRecipients(await res.json());
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled } : r))
    );
    try {
      const res = await fetch("/api/relay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to toggle recipient");
      }
      const updated: RelayRecipient = await res.json();
      setRecipients((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
    } catch (err: any) {
      setError(err.message);
      // Revert optimistic update
      setRecipients((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r))
      );
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

      {/* Recipients table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {recipients.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No relay recipients configured.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Enabled</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {recipients.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-700/30 transition">
                  <td className="px-4 py-3 font-medium">{r.label || "—"}</td>
                  <td className="px-4 py-3 font-mono text-zinc-300">{r.phone}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(r.id, !r.enabled)}
                      className={`rounded px-3 py-1 text-xs font-semibold transition ${
                        r.enabled
                          ? "bg-green-700/40 text-green-300 hover:bg-green-700/60"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {r.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemove(r.id)}
                      className="rounded px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/30 hover:text-red-300 transition"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">Add Recipient</h3>
        <div className="flex flex-wrap gap-3">
          <input
            type="tel"
            placeholder="Phone (e.g. +15551234567)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[180px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !phone.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
