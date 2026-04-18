"use client";
import { useTransition } from "react";
import { scanAction } from "@/app/reviews/actions";

export function ReviewsEmptyState() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold text-zinc-200">No projects yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
        The reviewer scans your configured project root for repos and creates a review job
        per project. Click below to discover projects now, then enable the ones you want
        scanned on a schedule.
      </p>
      <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs text-zinc-500">
        <li>• Reviewer scan root is set via the <code>REVIEWER_SCAN_ROOT</code> env var.</li>
        <li>• Each project must contain a <code>.openclaw-review/</code> directory or will get one on first run.</li>
        <li>• Manual runs from this page do not require a schedule.</li>
      </ul>
      <button
        disabled={pending}
        onClick={() => startTransition(() => scanAction())}
        className="mt-6 rounded bg-primary/20 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/30 disabled:opacity-50"
      >
        {pending ? "Scanning…" : "Scan for projects"}
      </button>
    </div>
  );
}
