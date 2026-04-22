"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationRow } from "@openclaw-manager/types";
import { StatusBadge } from "./status-badge";
import { timeAgo } from "@/lib/format";
import { ComposeDialog } from "./compose-dialog";
import { useTelemetry } from "@/lib/telemetry";
import {
  Button,
  EmptyState,
  PageHeader,
  StatCard,
  Table,
  TableWrap,
} from "./ui";

function InlineToggle({
  conversationKey,
  status,
}: {
  conversationKey: string;
  status: ConversationRow["status"];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isHuman = status === "human";
  const action = isHuman ? "release" : "takeover";

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationKey)}/${action}`, {
        method: "POST",
      });
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={isHuman ? "default" : "primary"}
      disabled={loading}
      onClick={handleClick}
      className="btn-sm"
    >
      {isHuman ? "Release" : "Take over"}
    </Button>
  );
}

export function ConversationTable({ conversations }: { conversations: ConversationRow[] }) {
  const router = useRouter();
  const { logAction } = useTelemetry();
  const [composingKey, setComposingKey] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);

  const composingConv = composingKey
    ? conversations.find((c) => c.conversationKey === composingKey)
    : null;

  const count = {
    active: conversations.filter((c) => c.status === "active").length,
    human: conversations.filter((c) => c.status === "human").length,
    waking: conversations.filter((c) => c.status === "waking").length,
    cold: conversations.filter((c) => c.status === "cold").length,
  };

  const subParts = [
    `${conversations.length} thread${conversations.length === 1 ? "" : "s"}`,
    count.human > 0 && `${count.human} on human`,
    count.waking > 0 && `${count.waking} waking`,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Conversations"
        sub={subParts.join(" · ")}
        actions={
          <>
            <Button onClick={() => router.refresh()}>Refresh</Button>
            <Button variant="primary" onClick={() => setComposingNew(true)}>
              + Compose
            </Button>
          </>
        }
      />

      <div className="hero-4">
        <StatCard label="Active" value={count.active} sub="agent replying" />
        <StatCard
          label="Human-handled"
          value={count.human}
          sub={count.human > 0 ? "awaiting release" : "—"}
          accent={count.human > 0 ? "var(--err)" : undefined}
        />
        <StatCard
          label="Waking"
          value={count.waking}
          sub={count.waking > 0 ? "re-engaging" : "—"}
          accent={count.waking > 0 ? "var(--warn)" : undefined}
        />
        <StatCard label="Cold" value={count.cold} sub="idle threads" />
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <th>Contact</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Last message</th>
              <th>Last reply</th>
              <th style={{ textAlign: "right", width: 200 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {conversations.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="No conversations yet"
                    description="They'll appear here as soon as a contact messages in."
                  />
                </td>
              </tr>
            )}
            {conversations.map((conv) => (
              <tr key={conv.conversationKey}>
                <td>
                  <Link
                    href={`/conversations/${encodeURIComponent(conv.conversationKey)}`}
                    className="pri"
                    onClick={() =>
                      logAction({
                        feature: "conversations",
                        action: "opened",
                        target: { type: "conversation", id: conv.conversationKey },
                        context: { conversationKey: conv.conversationKey },
                      })
                    }
                  >
                    {conv.displayName || "Unknown"}
                  </Link>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {conv.phone}
                </td>
                <td>
                  <StatusBadge status={conv.status} />
                </td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {timeAgo(conv.lastRemoteAt)}
                </td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {timeAgo(conv.lastAgentReplyAt)}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "inline-flex", gap: 6 }}>
                    <InlineToggle
                      conversationKey={conv.conversationKey}
                      status={conv.status}
                    />
                    <Button
                      onClick={() => setComposingKey(conv.conversationKey)}
                      className="btn-sm"
                    >
                      Compose
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {composingConv && (
        <ComposeDialog
          conversationKey={composingConv.conversationKey}
          phone={composingConv.phone}
          displayName={composingConv.displayName}
          onClose={() => setComposingKey(null)}
        />
      )}
      {composingNew && <ComposeDialog onClose={() => setComposingNew(false)} />}
    </>
  );
}
