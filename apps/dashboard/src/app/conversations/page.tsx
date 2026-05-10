import { AppShell } from "@/components/app-shell";
import { ConversationTable } from "@/components/conversation-table";
import { DegradedBanner } from "@/components/degraded-banner";
import { RuntimeKindBadge } from "@/components/runtime/runtime-kind-badge";
import { getConversations } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";

import type { ConversationRow } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  await requirePermission("conversations.view");
  let conversations: ConversationRow[] = [];
  let bridgeError = false;
  try {
    conversations = await getConversations();
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title="Conversations">
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Conversations</h1>
          <RuntimeKindBadge
            kind="openclaw"
            title="OpenClaw integration page — WhatsApp/relay-driven"
          />
        </div>
        {bridgeError && <DegradedBanner />}
        <ConversationTable conversations={conversations} />
      </div>
    </AppShell>
  );
}
