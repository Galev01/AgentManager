import { AppShell } from "@/components/app-shell";
import { RoutingRulesManager } from "@/components/routing-rules-manager";
import {
  getRoutingRules,
  getRelayRecipients,
  getConversations,
} from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type {
  ConversationRow,
  RoutingRule,
  RelayRecipient,
} from "@openclaw-manager/types";

export const metadata = { title: "Routing Rules" };
export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  await requirePermission("routing.view");
  let rules: RoutingRule[] = [];
  let recipients: RelayRecipient[] = [];
  let conversations: ConversationRow[] = [];

  try {
    [rules, recipients, conversations] = await Promise.all([
      getRoutingRules(),
      getRelayRecipients(),
      getConversations(),
    ]);
  } catch {
    // bridge unavailable — render with empty lists so the UI still loads.
  }

  return (
    <AppShell title="Routing Rules">
      <div className="content">
        <RoutingRulesManager
          initialRules={rules}
          recipients={recipients}
          conversations={conversations}
        />
      </div>
    </AppShell>
  );
}
