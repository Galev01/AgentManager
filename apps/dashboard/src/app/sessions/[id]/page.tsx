import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SessionChat } from "@/components/session-chat";
import { getSessionUsage } from "@/lib/bridge-client";
import type { AgentSession } from "@openclaw-manager/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Session: ${id.slice(0, 8)}` };
}

function StatusBadge({ status }: { status: AgentSession["status"] }) {
  const colors: Record<AgentSession["status"], string> = {
    active: "bg-green-900/50 text-green-300 border-green-700",
    completed: "bg-zinc-800 text-zinc-400 border-zinc-600",
    aborted: "bg-red-900/50 text-red-300 border-red-700",
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let usage: any = null;
  try {
    usage = await getSessionUsage(id);
  } catch {
    // bridge unavailable or session not found
  }

  const status: AgentSession["status"] = usage?.status ?? "completed";
  const tokenUsage = usage?.tokenUsage as AgentSession["tokenUsage"] | undefined;

  return (
    <AppShell title={`Session ${id.slice(0, 8)}`}>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back link */}
        <div>
          <Link
            href="/sessions"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            &larr; Back to Sessions
          </Link>
        </div>

        {/* Info card */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Session Info
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Session ID</p>
              <p className="font-mono text-sm text-zinc-200">{id.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Status</p>
              <StatusBadge status={status} />
            </div>
            {tokenUsage ? (
              <>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Prompt Tokens</p>
                  <p className="text-sm text-zinc-200">
                    {tokenUsage.prompt.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Completion Tokens</p>
                  <p className="text-sm text-zinc-200">
                    {tokenUsage.completion.toLocaleString()}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-xs text-zinc-500 mb-1">Total Tokens</p>
                  <p className="text-sm text-zinc-200">
                    {tokenUsage.total.toLocaleString()}
                  </p>
                </div>
              </>
            ) : (
              <div className="col-span-2 sm:col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Token Usage</p>
                <p className="text-sm text-zinc-500">—</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Chat
          </h2>
          <SessionChat sessionId={id} status={status} />
        </div>
      </div>
    </AppShell>
  );
}
