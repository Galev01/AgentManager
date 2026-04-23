import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AgentForm } from "@/components/agent-form";
import { getAgent } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: `Agent: ${decodeURIComponent(name)}` };
}

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  await requirePermission("agents.view");
  const { name } = await params;
  const agentName = decodeURIComponent(name);

  const agent = await getAgent(agentName);
  if (!agent) {
    notFound();
  }

  const parts: string[] = [];
  if (agent.createdAt) parts.push(`Created ${new Date(agent.createdAt).toLocaleString()}`);
  if (agent.updatedAt && agent.updatedAt !== agent.createdAt) {
    parts.push(`Updated ${new Date(agent.updatedAt).toLocaleString()}`);
  }

  return (
    <AppShell title={agent.name}>
      <div className="content">
        <div style={{ marginBottom: 12 }}>
          <Link
            href="/agents"
            style={{ fontSize: 12.5, color: "var(--text-muted)" }}
          >
            ← Back to Agents
          </Link>
        </div>
        <PageHeader
          title={agent.name}
          sub={parts.length > 0 ? parts.join(" · ") : undefined}
        />
        <AgentForm agent={agent} />
      </div>
    </AppShell>
  );
}
