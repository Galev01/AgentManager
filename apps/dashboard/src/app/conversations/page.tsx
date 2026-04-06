import { AppShell } from "@/components/app-shell";
import { ConversationTable } from "@/components/conversation-table";
import { DegradedBanner } from "@/components/degraded-banner";
import { AutoRefresh } from "@/components/auto-refresh";
import { getConversations } from "@/lib/bridge-client";
import type { ConversationRow } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  let conversations: ConversationRow[] = [];
  let bridgeError = false;
  try { conversations = await getConversations(); } catch { bridgeError = true; }

  return (
    <AppShell title="Conversations">
      <AutoRefresh intervalMs={30000} />
      {bridgeError && <DegradedBanner />}
      <ConversationTable conversations={conversations} />
    </AppShell>
  );
}
