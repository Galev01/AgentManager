import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DegradedBanner } from "@/components/degraded-banner";
import { BrainPersonDetail } from "@/components/brain-person-detail";
import { getBrainPerson } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function BrainPersonPage({
  params,
}: {
  params: Promise<{ phone: string }>;
}) {
  await requirePermission("brain.people.read");
  const { phone } = await params;
  const decoded = decodeURIComponent(phone);
  let person = null;
  let bridgeError = false;
  try {
    person = await getBrainPerson(decoded);
  } catch {
    bridgeError = true;
  }

  return (
    <AppShell title={person ? `Brain · ${person.name}` : "Brain · Person"}>
      <div className="mx-auto max-w-4xl space-y-6">
        {bridgeError && <DegradedBanner />}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/brain/people" className="text-xs text-blue-400 hover:text-blue-300">
              ← People
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">
              {person ? person.name : decoded}
            </h1>
            <p className="mt-1 text-xs text-zinc-500 font-mono">{decoded}</p>
          </div>
        </div>

        {!person && !bridgeError && (
          <div className="rounded border border-zinc-700 bg-zinc-800 px-4 py-6 text-center text-sm text-zinc-400">
            No note found for <code className="font-mono">{decoded}</code>.
          </div>
        )}

        {person && <BrainPersonDetail initial={person} />}
      </div>
    </AppShell>
  );
}
