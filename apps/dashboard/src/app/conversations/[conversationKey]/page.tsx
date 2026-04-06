import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { MessageTimeline } from "@/components/message-timeline";
import { TakeoverControls } from "@/components/takeover-controls";
import { DegradedBanner } from "@/components/degraded-banner";
import { ConversationTabs } from "@/components/conversation-tabs";
import { getConversation, getMessages } from "@/lib/bridge-client";
import { getBridgeWsUrl } from "@/lib/ws-url";
import { timeAgo } from "@/lib/format";
import Link from "next/link";
import type { ConversationEvent } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({ params }: { params: Promise<{ conversationKey: string }> }) {
  const { conversationKey } = await params;
  const decodedKey = decodeURIComponent(conversationKey);
  let conversation = null;
  let events: ConversationEvent[] = [];
  let bridgeError = false;

  try {
    [conversation, events] = await Promise.all([getConversation(decodedKey), getMessages(decodedKey)]);
  } catch { bridgeError = true; }

  const wsUrl = getBridgeWsUrl();

  if (!conversation && !bridgeError) {
    return (
      <AppShell title="Conversation" wsUrl={wsUrl}>
        <div className="rounded bg-dark-card p-12 text-center shadow-card-dark">
          <p className="text-text-muted">Conversation not found</p>
          <Link href="/conversations" className="mt-4 inline-block text-primary hover:underline">Back to conversations</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={conversation?.displayName || conversation?.phone || "Conversation"} wsUrl={wsUrl}>
      {bridgeError && <DegradedBanner />}
      {conversation && (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded bg-dark-card p-6 shadow-card-dark">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-lg font-medium">{conversation.displayName || "Unknown"}</p>
                <p className="text-sm text-text-muted">{conversation.phone}</p>
              </div>
              <StatusBadge status={conversation.status} />
            </div>
            <div className="flex items-center gap-6 text-sm text-text-muted">
              <span>Last message: {timeAgo(conversation.lastRemoteAt)}</span>
              <span>Last reply: {timeAgo(conversation.lastAgentReplyAt)}</span>
            </div>
          </div>
          <div className="mb-6"><TakeoverControls conversationKey={decodedKey} status={conversation.status} phone={conversation.phone} displayName={conversation.displayName} /></div>
          <ConversationTabs conversationKey={decodedKey} events={events} />
        </>
      )}
    </AppShell>
  );
}
