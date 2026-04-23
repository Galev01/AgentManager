import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { BrainPeopleTable } from "@/components/brain-people-table";
import { listBrainPeople, getBrainStatus } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { BrainPersonSummary } from "@openclaw-manager/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Brain · People" };

export default async function BrainPeoplePage() {
  await requirePermission("brain.people.read");
  let people: BrainPersonSummary[] = [];
  let enabled = false;
  let bridgeError = false;

  try {
    const status = await getBrainStatus();
    enabled = status.enabled;
  } catch {
    bridgeError = true;
  }

  if (enabled) {
    try {
      people = await listBrainPeople();
    } catch {
      bridgeError = true;
    }
  }

  return (
    <AppShell title="Brain · People">
      <div className="mx-auto max-w-5xl space-y-6">
        {bridgeError && <DegradedBanner />}
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">People</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Your Obsidian vault's <code className="font-mono">People/</code> folder, live. The agent reads these notes
            before replying. Edits made in Obsidian or here reflect both ways.
          </p>
        </div>

        {!enabled && !bridgeError && (
          <div className="rounded border border-yellow-700 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
            Brain vault is not configured. Set <code className="font-mono">BRAIN_VAULT_PATH</code> in the bridge's
            <code className="font-mono"> .env</code> (e.g. <code className="font-mono">C:\Users\GalLe\Documents\Brainclaw\OpenClaw Brain</code>) and restart the bridge.
          </div>
        )}

        {enabled && <BrainPeopleTable initial={people} />}
      </div>
    </AppShell>
  );
}
