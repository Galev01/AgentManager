"use client";
import Link from "next/link";
import type { ConversationRow } from "@openclaw-manager/types";
import { StatusBadge } from "./status-badge";
import { timeAgo } from "@/lib/format";

export function ConversationTable({ conversations }: { conversations: ConversationRow[] }) {
  if (conversations.length === 0) {
    return (
      <div className="rounded bg-dark-card p-12 text-center shadow-card-dark">
        <p className="text-text-muted">No conversations yet</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded bg-dark-card shadow-card-dark">
      <table className="w-full">
        <thead>
          <tr className="border-b border-dark-border text-left text-xs font-medium uppercase tracking-wider text-text-muted">
            <th className="px-6 py-4">Contact</th>
            <th className="px-6 py-4">Phone</th>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Last Message</th>
            <th className="px-6 py-4">Last Reply</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((conv) => (
            <tr key={conv.conversationKey} className="border-b border-dark-border/50 transition hover:bg-dark-lighter">
              <td className="px-6 py-4">
                <Link href={`/conversations/${encodeURIComponent(conv.conversationKey)}`} className="font-medium text-text-primary hover:text-primary">
                  {conv.displayName || "Unknown"}
                </Link>
              </td>
              <td className="px-6 py-4 text-sm text-text-gray">{conv.phone}</td>
              <td className="px-6 py-4"><StatusBadge status={conv.status} /></td>
              <td className="px-6 py-4 text-sm text-text-muted">{timeAgo(conv.lastRemoteAt)}</td>
              <td className="px-6 py-4 text-sm text-text-muted">{timeAgo(conv.lastAgentReplyAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
