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
import { getRuntimeConfig } from "@/lib/runtime-config-client";
import type {
  RuntimeSettingsV2,
  RelayRecipient,
  RoutingRule,
  Channel,
  RuntimeConfigSnapshot,
} from "@openclaw-manager/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings.read");
  let settings: RuntimeSettingsV2 | null = null;
  let recipients: RelayRecipient[] = [];
  let rules: RoutingRule[] = [];
  let channels: Channel[] = [];
  let runtimeConfig: RuntimeConfigSnapshot | null = null;
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

  try {
    runtimeConfig = await getRuntimeConfig();
  } catch {
    // bridge unreachable for runtime config — render section in degraded state
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
          initialRuntimeConfig={runtimeConfig}
        />
      )}
    </AppShell>
  );
}
