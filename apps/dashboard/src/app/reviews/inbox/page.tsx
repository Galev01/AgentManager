import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { InboxTable } from "@/components/inbox-table";
import { getReviewInbox } from "@/lib/bridge-client";

export const dynamic = "force-dynamic";

export default async function ReviewInboxPage() {
  let items: Awaited<ReturnType<typeof getReviewInbox>>["items"] = [];
  let error: string | null = null;
  try {
    const result = await getReviewInbox();
    items = result.items;
  } catch (err: any) {
    error = err?.message || "failed to load inbox";
  }

  return (
    <AppShell title="Review Inbox">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/reviews" className="text-xs text-zinc-400 hover:text-zinc-200">
              ← Projects view
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Review Inbox</h1>
            <p className="mt-1 text-sm text-zinc-500">
              All review reports across projects, ranked by triage state and severity.
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-800 px-4 py-12 text-center text-sm text-zinc-500">
            No reviews yet. Once projects start producing reports, they will appear here.
          </p>
        ) : (
          <InboxTable items={items} />
        )}
      </div>
    </AppShell>
  );
}
