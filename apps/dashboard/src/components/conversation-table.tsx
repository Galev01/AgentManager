"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationRow } from "@openclaw-manager/types";
import { StatusBadge } from "./status-badge";
import { timeAgo } from "@/lib/format";

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function InlineToggle({ conversationKey, status }: { conversationKey: string; status: ConversationRow["status"] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const isHuman = status === "human";
  const action = isHuman ? "release" : "takeover";

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationKey)}/${action}`, { method: "POST" });
      router.refresh();
    } catch {
      // silently ignore errors
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isHuman
          ? "bg-success hover:bg-success/80"
          : "bg-danger hover:bg-danger/80"
      }`}
    >
      {loading && <Spinner />}
      {isHuman ? "Release" : "Take Over"}
    </button>
  );
}

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
            <th className="px-6 py-4">Actions</th>
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
              <td className="px-6 py-4">
                <InlineToggle conversationKey={conv.conversationKey} status={conv.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
