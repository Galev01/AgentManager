import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SessionChat } from "@/components/session-chat";
import { getSessionUsage } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { AgentSession } from "@openclaw-manager/types";
import { Badge, Card, KV, PageHeader, SectionTitle, type BadgeKind } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return { title: `Session: ${id.slice(0, 8)}` };
}

const STATUS_KIND: Record<AgentSession["status"], BadgeKind> = {
  active: "ok",
  completed: "mute",
  aborted: "err",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("agent_sessions.view");
  const { id } = await params;

  let usage: any = null;
  try {
    usage = await getSessionUsage(id);
  } catch {
    // bridge unavailable or session not found
  }

  const status: AgentSession["status"] = usage?.status ?? "completed";
  const tokenUsage = usage?.tokenUsage as AgentSession["tokenUsage"] | undefined;

  const infoItems = [
    { label: "Session ID", value: <span className="mono">{id}</span> },
    { label: "Status", value: <Badge kind={STATUS_KIND[status]}>{status}</Badge> },
  ];
  if (tokenUsage) {
    infoItems.push(
      { label: "Prompt tokens", value: <span className="mono">{tokenUsage.prompt.toLocaleString()}</span> },
      { label: "Completion tokens", value: <span className="mono">{tokenUsage.completion.toLocaleString()}</span> },
      { label: "Total tokens", value: <span className="mono">{tokenUsage.total.toLocaleString()}</span> },
    );
  }

  return (
    <AppShell title={`Session ${id.slice(0, 8)}`}>
      <div className="content">
        <div style={{ marginBottom: 12 }}>
          <Link
            href="/sessions"
            style={{ fontSize: 12.5, color: "var(--text-muted)" }}
          >
            ← Back to Sessions
          </Link>
        </div>

        <PageHeader
          title={`Session ${id.slice(0, 8)}`}
          sub={<span className="mono" style={{ fontSize: 11 }}>{id}</span>}
          actions={<Badge kind={STATUS_KIND[status]}>{status}</Badge>}
        />

        <Card style={{ padding: 16, marginBottom: "var(--row-gap)" }}>
          <SectionTitle>Session info</SectionTitle>
          <div style={{ paddingTop: 8 }}>
            <KV items={infoItems} />
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <SectionTitle>Chat</SectionTitle>
          <div style={{ paddingTop: 8 }}>
            <SessionChat sessionId={id} status={status} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
