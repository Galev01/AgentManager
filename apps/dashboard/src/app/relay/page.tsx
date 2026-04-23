import { AppShell } from "@/components/app-shell";
import { RelayRecipientsForm } from "@/components/relay-recipients-form";
import { getRelayRecipients } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { RelayRecipient } from "@openclaw-manager/types";

export const metadata = { title: "Relay Recipients" };

export default async function RelayPage() {
  await requirePermission("relay.view");
  let recipients: RelayRecipient[] = [];
  try {
    recipients = await getRelayRecipients();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Relay Recipients">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Relay Recipients</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage the phone numbers that receive relayed messages. Toggle recipients
            on or off without removing them, or add new numbers below.
          </p>
        </div>
        <RelayRecipientsForm initial={recipients} />
      </div>
    </AppShell>
  );
}
