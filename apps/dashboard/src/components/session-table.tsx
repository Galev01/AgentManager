"use client";

import { useState } from "react";
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

export function SessionTable({ initial }: { initial: AgentSession[] }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<AgentSession[]>(initial);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered =
    filter === "all" ? sessions : sessions.filter((s) => s.status === filter);

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
      setSessions((prev) => [newSession, ...prev]);
      router.push(`/sessions/${newSession.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Agent sessions"
        sub={`${sessions.length} total · ${count.active} active · ${count.completed} completed${count.aborted ? ` · ${count.aborted} aborted` : ""}`}
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
        <StatCard label="Active" value={count.active} sub="of all" />
        <StatCard label="Completed" value={count.completed} sub="finished" />
        <StatCard label="Aborted" value={count.aborted} sub={count.aborted > 0 ? "needs review" : "—"} accent={count.aborted > 0 ? "var(--err)" : undefined} />
        <StatCard label="Tokens total" value={totalTokens.toLocaleString()} sub={`${totalMsgs.toLocaleString()} msgs`} />
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
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

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Agent</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Messages</th>
              <th style={{ textAlign: "right" }}>Tokens</th>
              <th>Created</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="No sessions" description="No agent sessions match this filter." />
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.id}
                onClick={() => router.push(`/sessions/${s.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td className="pri mono" style={{ fontSize: 12 }}>
                  {s.id.slice(0, 8)}
                </td>
                <td>{s.agentName || <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
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
                  {s.createdAt ? timeAgo(s.createdAt) : "—"}
                </td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {s.lastActivityAt ? timeAgo(s.lastActivityAt) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
