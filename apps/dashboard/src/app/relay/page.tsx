import { AppShell } from "@/components/app-shell";
import { RelayRecipientsForm } from "@/components/relay-recipients-form";
import { RuntimeKindBadge } from "@/components/runtime/runtime-kind-badge";
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 className="text-2xl font-semibold text-zinc-100" style={{ margin: 0 }}>
            Relay Recipients
          </h1>
          <RuntimeKindBadge
            kind="openclaw"
            title="OpenClaw integration page — relay recipients only apply when OpenClaw is the active runtime"
          />
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Manage the phone numbers that receive relayed messages. Toggle recipients
          on or off without removing them, or add new numbers below.
        </p>
        <RelayRecipientsForm initial={recipients} />
      </div>
    </AppShell>
  );
}
