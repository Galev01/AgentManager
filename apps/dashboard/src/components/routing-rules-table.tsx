"use client";

import { useState } from "react";
import type { RoutingRule, RelayRecipient } from "@openclaw-manager/types";

interface Props {
  initialRules: RoutingRule[];
  recipients: RelayRecipient[];
}

export function RoutingRulesTable({ initialRules, recipients }: Props) {
  const [rules, setRules] = useState<RoutingRule[]>(initialRules);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [conversationKey, setConversationKey] = useState("");
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState("");
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [suppressBot, setSuppressBot] = useState(false);
  const [adding, setAdding] = useState(false);

  function toggleRecipient(id: string) {
    setSelectedRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  function recipientLabel(id: string): string {
    const r = recipients.find((rec) => rec.id === id);
    return r ? r.label || r.phone : id;
  }

  async function handleAdd() {
    if (!conversationKey.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationKey: conversationKey.trim(),
          phone: phone.trim() || null,
          displayName: displayName.trim() || null,
          note: note.trim() || null,
          relayRecipientIds: selectedRecipientIds,
          suppressBot,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create routing rule");
      }
      const newRule: RoutingRule = await res.json();
      setRules((prev) => [...prev, newRule]);
      setConversationKey("");
      setPhone("");
      setDisplayName("");
      setNote("");
      setSelectedRecipientIds([]);
      setSuppressBot(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch("/api/routing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete routing rule");
      }
    } catch (err: any) {
      setError(err.message);
      const res = await fetch("/api/routing");
      if (res.ok) setRules(await res.json());
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

      {/* Rules table */}
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {rules.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No routing rules configured.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-zinc-100">
              <thead>
                <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Relay To</th>
                  <th className="px-4 py-3">Suppress Bot</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700">
                {rules.map((rule) => (
                  <tr key={rule.id} className="transition hover:bg-zinc-700/30">
                    <td className="px-4 py-3 font-medium">
                      {rule.displayName || rule.conversationKey}
                      {rule.displayName && (
                        <div className="text-xs text-zinc-500">{rule.conversationKey}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300">
                      {rule.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {rule.relayRecipientIds.length === 0 ? (
                        <span className="text-zinc-500">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {rule.relayRecipientIds.map((rid) => (
                            <span
                              key={rid}
                              className="rounded bg-blue-900/40 px-2 py-0.5 text-xs text-blue-300"
                            >
                              {recipientLabel(rid)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rule.suppressBot ? (
                        <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs font-semibold text-amber-300">
                          Yes
                        </span>
                      ) : (
                        <span className="rounded bg-zinc-700/60 px-2 py-0.5 text-xs font-semibold text-zinc-400">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 max-w-[200px] truncate">
                      {rule.note || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="rounded px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-900/30 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">Add Routing Rule</h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Conversation key (required)"
              value={conversationKey}
              onChange={(e) => setConversationKey(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 min-w-[160px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <input
            type="text"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />

          {recipients.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-zinc-400">Relay to recipients (click to toggle):</p>
              <div className="flex flex-wrap gap-2">
                {recipients.map((r) => {
                  const selected = selectedRecipientIds.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRecipient(r.id)}
                      className={`rounded px-3 py-1 text-xs font-semibold transition ${
                        selected
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                      }`}
                    >
                      {r.label || r.phone}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={suppressBot}
                onChange={(e) => setSuppressBot(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 accent-blue-500"
              />
              Suppress bot for this contact
            </label>

            <button
              onClick={handleAdd}
              disabled={adding || !conversationKey.trim()}
              className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add Rule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
