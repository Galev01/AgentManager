"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentSession } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  TableWrap,
  type BadgeKind,
} from "./ui";

type StatusFilter = "all" | "active" | "completed" | "aborted";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Aborted", value: "aborted" },
];

const STATUS_KIND: Record<AgentSession["status"], BadgeKind> = {
  active: "ok",
  completed: "mute",
  aborted: "err",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-sunken)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--text)",
  fontFamily: "inherit",
  flex: 1,
  minWidth: 220,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function sessionDuration(s: AgentSession): string {
  if (!s.createdAt) return "—";
  const end = s.lastActivityAt ?? s.createdAt;
  const ms = end - s.createdAt;
  return ms > 0 ? formatDuration(ms) : "—";
}

export function SessionTable({ initial }: { initial: AgentSession[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AgentSession[]>(initial);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (!q) return true;
      return (
        (s.id ?? "").toLowerCase().includes(q) ||
        (s.agentName ?? "").toLowerCase().includes(q)
      );
    });
  }, [sessions, filter, query]);

  const count = {
    active: sessions.filter((s) => s.status === "active").length,
    completed: sessions.filter((s) => s.status === "completed").length,
    aborted: sessions.filter((s) => s.status === "aborted").length,
  };
  const totalMsgs = sessions.reduce((a, s) => a + (s.messageCount ?? 0), 0);
  const totalTokens = sessions.reduce(
    (a, s) => a + (s.tokenUsage?.total ?? 0),
    0,
  );

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
      if (!newSession || typeof newSession.id !== "string" || !newSession.id) {
        throw new Error("Server returned a session with no id");
      }
      setSessions((prev) => [newSession, ...prev]);
      router.push(`/sessions/${newSession.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function copyId(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    } catch {
      // clipboard unavailable — silent
    }
  }

  return (
    <>
      <PageHeader
        title="Agent sessions"
        actions={
          <Button variant="primary" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating…" : "+ New session"}
          </Button>
        }
      />

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid oklch(0.68 0.20 25 / 0.4)",
            background: "var(--err-dim)",
            color: "var(--err)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{error}</span>
          <Button variant="ghost" className="btn-sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="hero-4">
        <StatCard
          label="Active"
          value={count.active}
          sub={count.active > 0 ? "running" : "—"}
          accent={count.active > 0 ? "var(--ok)" : undefined}
        />
        <StatCard label="Completed" value={count.completed} sub="finished" />
        <StatCard
          label="Aborted"
          value={count.aborted}
          sub={count.aborted > 0 ? "needs review" : "—"}
          accent={count.aborted > 0 ? "var(--err)" : undefined}
        />
        <StatCard
          label="Tokens total"
          value={totalTokens.toLocaleString()}
          sub={`${totalMsgs.toLocaleString()} msgs`}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          margin: "12px 0",
        }}
      >
        <input
          type="text"
          placeholder="Search by id or agent…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={INPUT_STYLE}
        />
        <div className="tabs" style={{ margin: 0 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`tab ${filter === f.value ? "on" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Agent</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Messages</th>
              <th style={{ textAlign: "right" }}>Tokens</th>
              <th>Duration</th>
              <th>Created</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title="No sessions"
                    description={
                      query || filter !== "all"
                        ? "No sessions match the current filter."
                        : "No agent sessions yet. Create one to get started."
                    }
                  />
                </td>
              </tr>
            )}
            {filtered.map((s, idx) => {
              const sid = typeof s.id === "string" ? s.id : "";
              return (
              <tr
                key={sid || `row-${idx}`}
                onClick={() => sid && router.push(`/sessions/${sid}`)}
                style={{ cursor: sid ? "pointer" : "default" }}
              >
                <td className="pri mono" style={{ fontSize: 12 }}>
                  {sid ? (
                    <button
                      type="button"
                      onClick={(e) => copyId(sid, e)}
                      title={sid + " (click to copy)"}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {copied === sid ? "copied!" : sid.slice(0, 8)}
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
                <td>
                  {s.agentName || <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td>
                  <Badge kind={STATUS_KIND[s.status]}>{s.status}</Badge>
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {s.messageCount ?? "—"}
                </td>
                <td className="mono" style={{ textAlign: "right" }}>
                  {s.tokenUsage ? s.tokenUsage.total.toLocaleString() : "—"}
                </td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {sessionDuration(s)}
                </td>
                <td
                  className="mono"
                  style={{ fontSize: 11.5, color: "var(--text-muted)" }}
                  title={s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}
                >
                  {s.createdAt ? timeAgo(s.createdAt) : "—"}
                </td>
                <td
                  className="mono"
                  style={{ fontSize: 11.5, color: "var(--text-muted)" }}
                  title={s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : ""}
                >
                  {s.lastActivityAt ? timeAgo(s.lastActivityAt) : "—"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
