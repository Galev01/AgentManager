import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RuntimeSessionDetailView } from "@/components/runtime-session-detail";
import { getRuntimeSessionDetail } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function RuntimeSessionPage({
  params,
}: {
  params: Promise<{ runtimeId: string; sessionId: string }>;
}) {
  await requirePermission("claude_code.view");
  const { runtimeId, sessionId } = await params;
  const detail = await getRuntimeSessionDetail(runtimeId, sessionId).catch(() => null);
  if (!detail) notFound();
  const title = detail.list.displayName || detail.list.sessionId;
  return (
    <AppShell title={`Session · ${title}`}>
      <div className="content">
        <RuntimeSessionDetailView detail={detail} />
      </div>
    </AppShell>
  );
}
