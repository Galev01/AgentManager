import { AppShell } from "@/components/app-shell";
import { RoutingRulesTable } from "@/components/routing-rules-table";
import { getRoutingRules, getRelayRecipients } from "@/lib/bridge-client";
import type { RoutingRule, RelayRecipient } from "@openclaw-manager/types";

export const metadata = { title: "Routing Rules" };

export default async function RoutingPage() {
  let rules: RoutingRule[] = [];
  let recipients: RelayRecipient[] = [];

  try {
    [rules, recipients] = await Promise.all([
      getRoutingRules(),
      getRelayRecipients(),
    ]);
  } catch {
    // bridge unavailable — show empty lists
  }

  return (
    <AppShell title="Routing Rules">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Routing Rules</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure per-contact routing overrides: relay messages to specific
            recipients, suppress the bot, or attach notes for a given conversation.
          </p>
        </div>
        <RoutingRulesTable initialRules={rules} recipients={recipients} />
      </div>
    </AppShell>
  );
}
