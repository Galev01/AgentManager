"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useBridgeEvents } from "@/lib/ws-client";
import type { BrainPersonSummary } from "@openclaw-manager/types";

export function BrainPeopleTable({ initial }: { initial: BrainPersonSummary[] }) {
  const [people, setPeople] = useState<BrainPersonSummary[]>(initial);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "archived" | "blocked">("active");
  const [sortBy, setSortBy] = useState<"lastSeen" | "name" | "unread">("lastSeen");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/people", { cache: "no-store" });
      if (res.ok) setPeople(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useBridgeEvents((msg) => {
    if (msg.type === "brain_person_changed" || msg.type === "brain_person_removed") {
      void refresh();
    }
  });

  async function handleCreate() {
    if (!phone.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create person");
      }
      setPhone("");
      setName("");
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    setPeople(initial);
  }, [initial]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = people.filter((p) => status === "all" || p.status === status);
    if (q) {
      list = list.filter((p) =>
        (p.name || "").toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q),
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
      if (sortBy === "unread") return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
    });
    return list;
  }, [people, query, status, sortBy]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-200">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search name / phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[240px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-zinc-100">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded border border-zinc-600 bg-zinc-900 px-2 py-2 text-sm text-zinc-100">
          <option value="lastSeen">Last message</option>
          <option value="name">Name</option>
          <option value="unread">Unread</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
        {view.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-400">
            No people yet. They'll appear here automatically when WhatsApp contacts write in, or you can add one below.
          </div>
        ) : (
          <table className="w-full text-sm text-zinc-100">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Relationship</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {view.map((p) => (
                <tr key={p.phone} className="hover:bg-zinc-700/30 transition">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{p.phone}</td>
                  <td className="px-4 py-3 text-zinc-300">{p.relationship || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{p.language || "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{p.status}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.lastSeen || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/brain/people/${encodeURIComponent(p.phone)}`}
                      className="rounded px-3 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-900/30 hover:text-blue-300 transition"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">Add person</h3>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Phone (E.164 or JID, required)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 min-w-[220px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 min-w-[200px] rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={adding || !phone.trim()}
            className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          A markdown note will be created in your Obsidian vault at <code className="font-mono">People/&lt;phone&gt;.md</code>.
        </p>
      </div>
    </div>
  );
}
