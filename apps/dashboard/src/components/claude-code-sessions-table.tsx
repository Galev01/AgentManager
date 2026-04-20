"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClaudeCodeSession } from "@openclaw-manager/types";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  StatCard,
  StatusLamp,
  Table,
  TableWrap,
} from "./ui";
import { ClaudeCodeConnectModalBody } from "./claude-code-connect-modal";

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
  const totalPending = Object.values(pendingBySession).reduce((a, b) => a + b, 0);
  const totalMessages = sessions.reduce((a, s) => a + (s.messageCount ?? 0), 0);
  const agentCount = active.filter((s) => s.mode === "agent").length;

  const subParts = [
    `${active.length} active`,
    ended.length > 0 && `${ended.length} ended`,
    totalPending > 0 && `${totalPending} pending`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Claude Code"
        sub={subParts.join(" · ")}
        actions={
          <>
            <Button onClick={() => router.refresh()}>Refresh</Button>
            <Button variant="primary" onClick={() => setShowConnect(true)}>
              + Connect IDE
            </Button>
          </>
        }
      />

      <div className="hero-4">
        <StatCard
          label="Active sessions"
          value={active.length}
          sub={sessions.length > 0 ? `of ${sessions.length}` : undefined}
        />
        <StatCard
          label="Agent mode"
          value={agentCount}
          sub={active.length > 0 ? `of ${active.length} active` : "—"}
        />
        <StatCard
          label="Pending approvals"
          value={totalPending}
          sub={totalPending > 0 ? "awaiting moderation" : "none"}
          accent={totalPending > 0 ? "var(--warn)" : undefined}
        />
        <StatCard
          label="Messages total"
          value={totalMessages.toLocaleString()}
          sub={sessions.length > 0 ? `across ${sessions.length} sessions` : "—"}
        />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th style={{ width: 28 }}></th>
              <th>Session</th>
              <th>Mode</th>
              <th>State</th>
              <th>Activity</th>
              <th>Pending</th>
              <th style={{ textAlign: "right", width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No Claude Code sessions yet"
                    description="Connect an IDE to start a session."
                    action={
                      <Button variant="primary" onClick={() => setShowConnect(true)}>
                        + Connect IDE
                      </Button>
                    }
                  />
                </td>
              </tr>
            )}
            {sessions.map((s) => {
              const pendingCount = pendingBySession[s.id] ?? 0;
              const lamp = s.state === "ended" ? "off" : pendingCount > 0 ? "warn" : "ok";
              return (
                <tr key={s.id}>
                  <td>
                    <StatusLamp status={lamp} />
                  </td>
                  <td>
                    <Link href={`/claude-code/${s.id}`} className="pri">
                      {s.displayName}
                    </Link>
                    <div className="row-sub">
                      {s.ide ?? "—"} · <span className="mono">{s.id.slice(0, 8)}</span>
                    </div>
                  </td>
                  <td>
                    <button
                      className={`badge ${s.mode === "agent" ? "ok" : "warn"}`}
                      onClick={() => patch(s.id, { mode: s.mode === "agent" ? "manual" : "agent" })}
                      style={{ cursor: "pointer" }}
                      title="Toggle mode"
                    >
                      {s.mode}
                    </button>
                  </td>
                  <td>
                    <Badge kind={s.state === "active" ? "acc" : "mute"}>{s.state}</Badge>
                  </td>
                  <td>
                    <div className="pri mono" style={{ fontSize: 12 }}>
                      {s.messageCount} msgs
                    </div>
                    <div className="row-sub">{relativeTime(s.lastActivityAt)}</div>
                  </td>
                  <td>
                    {pendingCount > 0 ? (
                      <Badge kind="warn" dot>
                        {pendingCount}
                      </Badge>
                    ) : (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {s.state === "active" ? (
                      <Button variant="ghost" onClick={() => patch(s.id, { state: "ended" })}>
                        End
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => patch(s.id, { state: "active" })}>
                        Resurrect
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
    </>
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="modal-t">Connect a new IDE</div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="modal-b">
          <ClaudeCodeConnectModalBody />
        </div>
      </div>
    </div>
  );
}
