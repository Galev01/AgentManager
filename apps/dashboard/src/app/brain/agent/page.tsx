import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { GlobalBrainEditor } from "@/components/brain-global-editor";
import { CollapsibleCard } from "@/components/brain-collapsible-card";
import { GlobalBrainPreviewCard } from "@/components/brain-global-preview-card";
import { getGlobalBrain, getBrainStatus } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { GlobalBrain } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain · Global" };

export default async function BrainAgentPage() {
  await requirePermission("brain.global.read");
  let brain: GlobalBrain | null = null;
  let enabled = false;
  let bridgeError = false;

  try {
    const status = await getBrainStatus();
    enabled = status.enabled;
  } catch { bridgeError = true; }

  if (enabled) {
    try { brain = await getGlobalBrain(); } catch { bridgeError = true; }
  }

  return (
    <AppShell title="Brain · Global">
      <div className="mx-auto max-w-3xl space-y-6">
        {bridgeError && <DegradedBanner />}
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">WhatsApp agent — global brain</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Lives at <code className="font-mono">Brain/WhatsApp.md</code> in your Obsidian vault. The gateway reads this file before per-person context on every reply. Runtime enforcement of Do-Not-Say / kill-switch / silent-mode is a phase-2 gateway change.
          </p>
        </div>

        {!enabled && !bridgeError && (
          <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
            Brain vault is not configured. Set <code className="font-mono">BRAIN_VAULT_PATH</code> in the bridge&apos;s <code className="font-mono">.env</code> and restart.
          </div>
        )}

        {enabled && brain && (
          <>
            <GlobalBrainEditor initial={brain} />
            <CollapsibleCard title="Injection preview" storageKey="brain.agent.preview" defaultOpen={false} hint="What every reply prompt starts with.">
              <GlobalBrainPreviewCard />
            </CollapsibleCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
