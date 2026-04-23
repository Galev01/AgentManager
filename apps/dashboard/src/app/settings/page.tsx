import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { DegradedBanner } from "@/components/degraded-banner";
import { getSettings } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { RuntimeSettings } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePermission("settings.read");
  let settings: RuntimeSettings | null = null;
  let bridgeError = false;
  try { settings = await getSettings(); } catch { bridgeError = true; }

  return (
    <AppShell title="Settings">
      {bridgeError && <DegradedBanner />}
      {settings ? (
        <div className="max-w-2xl rounded bg-dark-card p-8 shadow-card-dark">
          <h2 className="mb-6 text-lg font-semibold">Runtime Settings</h2>
          <SettingsForm settings={settings} />
        </div>
      ) : !bridgeError && <p className="text-text-muted">Loading settings...</p>}
    </AppShell>
  );
}
