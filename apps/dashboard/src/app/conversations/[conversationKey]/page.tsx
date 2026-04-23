import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { TakeoverControls } from "@/components/takeover-controls";
import { DegradedBanner } from "@/components/degraded-banner";
import { ConversationTabs } from "@/components/conversation-tabs";
import { getConversation, getMessages } from "@/lib/bridge-client";
import { EmptyState, PageHeader, Button } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import { requirePermission } from "@/lib/auth/current-user";
import Link from "next/link";
import type { ConversationEvent } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ conversationKey: string }>;
}) {
  await requirePermission("conversations.view");
  const { conversationKey } = await params;
  const decodedKey = decodeURIComponent(conversationKey);
  let conversation = null;
  let events: ConversationEvent[] = [];
  let bridgeError = false;

  try {
    [conversation, events] = await Promise.all([
      getConversation(decodedKey),
      getMessages(decodedKey),
    ]);
  } catch {
    bridgeError = true;
  }

  if (!conversation && !bridgeError) {
    return (
      <AppShell title="Conversation">
        <div className="content">
          <EmptyState
            title="Conversation not found"
            description="The thread may have been deleted or never existed."
            action={
              <Link href="/conversations">
                <Button variant="primary">Back to conversations</Button>
              </Link>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={conversation?.displayName || conversation?.phone || "Conversation"}>
      <div className="content">
        {bridgeError && <DegradedBanner />}
        {conversation && (
          <>
            <PageHeader
              title={conversation.displayName || "Unknown"}
              sub={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span className="mono">{conversation.phone}</span>
                  <StatusBadge status={conversation.status} />
                  <span style={{ color: "var(--text-muted)" }}>
                    last msg {timeAgo(conversation.lastRemoteAt)} · last reply{" "}
                    {timeAgo(conversation.lastAgentReplyAt)}
                  </span>
                </span>
              }
              actions={
                <TakeoverControls
                  conversationKey={decodedKey}
                  status={conversation.status}
                  phone={conversation.phone}
                  displayName={conversation.displayName}
                />
              }
            />
            <ConversationTabs conversationKey={decodedKey} events={events} />
          </>
        )}
      </div>
    </AppShell>
  );
}
