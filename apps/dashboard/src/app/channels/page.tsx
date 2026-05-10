import { AppShell } from "@/components/app-shell";
import { ChannelCards } from "@/components/channel-cards";
import { CapabilityGate } from "@/components/runtime/capability-gate";
import { RuntimeKindBadge } from "@/components/runtime/runtime-kind-badge";
import { getChannels } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import { resolveActiveRuntimeId } from "@/lib/runtime-active";
import type { Channel } from "@openclaw-manager/types";

export const metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage(props: {
  searchParams: Promise<{ runtimeId?: string }>;
}) {
  await requirePermission("channels.view");
  const sp = await props.searchParams;
  const runtimeId = await resolveActiveRuntimeId(sp.runtimeId);
  let channels: Channel[] = [];
  let fetchError: string | null = null;
  try {
    channels = await getChannels(runtimeId);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load channels";
  }

  return (
    <AppShell title="Channels">
      <div className="content">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Channels</h1>
          <RuntimeKindBadge kind="openclaw" title="OpenClaw integration page" />
        </div>
        {fetchError ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid oklch(0.68 0.20 25 / 0.4)",
              background: "var(--err-dim)",
              color: "var(--err)",
              fontSize: 13,
            }}
          >
            <strong>Failed to load channels.</strong> {fetchError}
          </div>
        ) : null}
        <CapabilityGate runtimeId={runtimeId ?? ""} capabilityId="channels.list">
          <ChannelCards initial={channels} />
        </CapabilityGate>
      </div>
    </AppShell>
  );
}
