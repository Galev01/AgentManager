import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgentForm } from "@/components/agent-form";
import { getAgent } from "@/lib/bridge-client";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: `Agent: ${decodeURIComponent(name)}` };
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const agentName = decodeURIComponent(name);

  const agent = await getAgent(agentName);
  if (!agent) {
    notFound();
  }

  return (
    <AppShell title={agent.name}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/agents"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            &larr; Back to Agents
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">{agent.name}</h1>
          {agent.createdAt && (
            <p className="mt-1 text-sm text-zinc-500">
              Created {new Date(agent.createdAt).toLocaleString()}
              {agent.updatedAt && agent.updatedAt !== agent.createdAt && (
                <> &middot; Updated {new Date(agent.updatedAt).toLocaleString()}</>
              )}
            </p>
          )}
        </div>
        <AgentForm agent={agent} />
      </div>
    </AppShell>
  );
}
