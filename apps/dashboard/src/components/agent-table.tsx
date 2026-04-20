"use client";

import { useState } from "react";
import Link from "next/link";
import type { Agent } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";
import type { AgentActivity } from "@/app/agents/page";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Table,
  TableWrap,
} from "./ui";

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-sunken)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "7px 10px",
  fontSize: 13,
  color: "var(--text)",
  fontFamily: "inherit",
  flex: 1,
  minWidth: 180,
};

function getWorkspace(a: Agent): string | null {
  const w = (a as Agent & { workspace?: unknown }).workspace;
  return typeof w === "string" && w.length > 0 ? w : null;
}

function shortenPath(p: string, max = 36): string {
  if (p.length <= max) return p;
  const parts = p.split(/[\\/]/);
  if (parts.length <= 2) return "…" + p.slice(-max + 1);
  return parts[0] + "/…/" + parts.slice(-2).join("/");
}

export function AgentTable({
  initial,
  activity,
}: {
  initial: Agent[];
  activity: Record<string, AgentActivity>;
}) {
  const [agents, setAgents] = useState<Agent[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [model, setModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim() || !workspace.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          workspace: workspace.trim(),
          model: model.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent");
      }
      const newAgent: Agent = await res.json();
      setAgents((prev) => [...prev, newAgent]);
      setName("");
      setWorkspace("");
      setModel("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      const res = await fetch("/api/agents");
      if (res.ok) setAgents(await res.json());
    }
  }

  return (
    <>
      <PageHeader
        title="Agents"
        sub={`${agents.length} configured`}
        actions={
          <Button
            variant="primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? "Cancel" : "+ New agent"}
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
          <span style={{ flex: 1 }}>{error}</span>
          <Button variant="ghost" className="btn-sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {showCreate && (
        <Card style={{ marginBottom: "var(--row-gap)" }}>
          <SectionTitle>Create agent</SectionTitle>
          <div style={{ padding: 16 }}>
            <p style={{ margin: "0 0 14px 0", fontSize: 12, color: "var(--text-muted)" }}>
              Workspace is the absolute path to an OpenClaw workspace on the bridge host, e.g.{" "}
              <code style={{ fontSize: 11.5, color: "var(--text)" }}>
                C:\Users\you\.openclaw\workspace
              </code>
              .
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input
                type="text"
                placeholder="Name (required)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={INPUT_STYLE}
              />
              <input
                type="text"
                placeholder="Workspace path (required)"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={{ ...INPUT_STYLE, minWidth: 260 }}
              />
              <input
                type="text"
                placeholder="Model (optional)"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                style={INPUT_STYLE}
              />
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={adding || !name.trim() || !workspace.trim()}
              >
                {adding ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Model</th>
              <th>Workspace</th>
              <th>Tools</th>
              <th style={{ textAlign: "right" }}>Active</th>
              <th>Last used</th>
              <th style={{ textAlign: "right", width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No agents configured"
                    description="Click + New agent to create one."
                    action={
                      <Button
                        variant="primary"
                        onClick={() => setShowCreate(true)}
                      >
                        + New agent
                      </Button>
                    }
                  />
                </td>
              </tr>
            )}
            {agents.map((a) => {
              const act = activity[a.name];
              const ws = getWorkspace(a);
              const toolsLabel = a.tools && a.tools.length > 0 ? a.tools.join(", ") : "";
              return (
                <tr key={a.name}>
                  <td className="pri">{a.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {a.model || <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td
                    className="mono"
                    style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 240 }}
                    title={ws ?? ""}
                  >
                    {ws ? shortenPath(ws) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td>
                    {a.tools && a.tools.length > 0 ? (
                      <span title={toolsLabel}>
                        <Badge kind="info">{a.tools.length}</Badge>
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {act?.activeSessions ? (
                      <Badge kind="ok">{act.activeSessions}</Badge>
                    ) : (
                      <span style={{ color: "var(--text-faint)" }}>0</span>
                    )}
                  </td>
                  <td
                    className="mono"
                    style={{ fontSize: 11.5, color: "var(--text-muted)" }}
                    title={act?.lastUsedAt ? new Date(act.lastUsedAt).toLocaleString() : ""}
                  >
                    {act?.lastUsedAt ? timeAgo(act.lastUsedAt) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <Link href={`/agents/${encodeURIComponent(a.name)}`}>
                        <Button className="btn-sm">View</Button>
                      </Link>
                      <Button
                        variant="danger"
                        className="btn-sm"
                        onClick={() => handleDelete(a.name)}
                      >
                        Delete
                      </Button>
                    </div>
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
