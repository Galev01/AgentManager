import type { RuntimeSessionDetail, RuntimeSessionMessage } from "@openclaw-manager/types";
import { PageHeader, Badge, Card } from "./ui";

function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  try { return new Date(ms).toLocaleString(); } catch { return "—"; }
}

function roleLabel(role: RuntimeSessionMessage["role"]): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  if (role === "tool") return "Tool";
  return "Unknown";
}

export function RuntimeSessionDetailView({ detail }: { detail: RuntimeSessionDetail }) {
  const { list, messages, systemPrompt, totals } = detail;
  const sub = [
    list.runtimeKind,
    list.model && `model: ${list.model}`,
    `${messages.length} messages`,
    list.lastActivityAt && `last activity: ${fmtTime(list.lastActivityAt)}`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader title={list.displayName || list.sessionId} sub={sub} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {systemPrompt ? (
          <Card>
            <details>
              <summary><Badge>System prompt</Badge></summary>
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{systemPrompt}</pre>
            </details>
          </Card>
        ) : null}
        {totals && (totals.inputTokens || totals.outputTokens) ? (
          <Card>
            <small>
              tokens · in {totals.inputTokens ?? 0} · out {totals.outputTokens ?? 0}
              {totals.cacheReadTokens ? ` · cache-read ${totals.cacheReadTokens}` : ""}
              {totals.cacheCreateTokens ? ` · cache-write ${totals.cacheCreateTokens}` : ""}
            </small>
          </Card>
        ) : null}
        {messages.length === 0 ? (
          <Card><em>No messages in this session yet.</em></Card>
        ) : (
          messages.map((m, idx) => (
            <Card key={m.id ?? m.index ?? idx}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Badge>{roleLabel(m.role)}</Badge>
                {m.model ? <small>{m.model}</small> : null}
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</pre>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
