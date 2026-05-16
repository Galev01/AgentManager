import Link from "next/link";
import type { RuntimeSessionListItem } from "@openclaw-manager/types";
import { EmptyState, Table, TableWrap } from "./ui";

function formatTimestamp(ms: number | null | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "—";
  }
}

export function RuntimeSessionsTable({
  sessions,
  runtimeKindLabel,
}: {
  sessions: RuntimeSessionListItem[];
  runtimeKindLabel: string;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title={`No ${runtimeKindLabel} sessions yet`}
        description="Conversations routed through this runtime will appear here."
      />
    );
  }
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Model</th>
            <th>Messages</th>
            <th>Last activity</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={`${s.runtimeId}:${s.sessionId}`}>
              <td>
                <Link
                  href={`/claude-code/runtime/${encodeURIComponent(s.runtimeId)}/${encodeURIComponent(s.sessionId)}`}
                >
                  {s.displayName || s.sessionId}
                </Link>
              </td>
              <td>{s.model ?? "—"}</td>
              <td>{s.messageCount ?? "—"}</td>
              <td>{formatTimestamp(s.lastActivityAt)}</td>
              <td>{formatTimestamp(s.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
