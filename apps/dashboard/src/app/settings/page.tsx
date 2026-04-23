import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { SettingsView } from "@/components/settings/settings-view";
import { requirePermission } from "@/lib/auth/current-user";
import {
  getSettings,
  getRelayRecipients,
  getRoutingRules,
  getChannels,
} from "@/lib/bridge-client";
import type {
  RuntimeSettingsV2,
  RelayRecipient,
  RoutingRule,
  Channel,
} from "@openclaw-manager/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.read");
  let settings: RuntimeSettingsV2 | null = null;
  let recipients: RelayRecipient[] = [];
  let rules: RoutingRule[] = [];
  let channels: Channel[] = [];
  let bridgeError = false;

  try {
    [settings, recipients, rules, channels] = await Promise.all([
      getSettings(),
      getRelayRecipients(),
      getRoutingRules(),
      getChannels().catch(() => []),
    ]);
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title="Settings">
      {bridgeError && <DegradedBanner />}
      {settings && (
        <SettingsView
          initialSettings={settings}
          initialRecipients={recipients}
          initialRules={rules}
          initialChannels={channels}
        />
      )}
    </AppShell>
  );
}
