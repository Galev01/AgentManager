import { AppShell } from "@/components/app-shell";
import { ConversationTable } from "@/components/conversation-table";
import { DegradedBanner } from "@/components/degraded-banner";
import { getConversations } from "@/lib/bridge-client";
import { getBridgeWsUrl } from "@/lib/ws-url";
import type { ConversationRow } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  let conversations: ConversationRow[] = [];
  let bridgeError = false;
  try { conversations = await getConversations(); } catch { bridgeError = true; }

  const wsUrl = getBridgeWsUrl();

  return (
    <AppShell title="Conversations" wsUrl={wsUrl}>
      {bridgeError && <DegradedBanner />}
      <ConversationTable conversations={conversations} />
    </AppShell>
  );
}
