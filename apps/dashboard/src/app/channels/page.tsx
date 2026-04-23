import { AppShell } from "@/components/app-shell";
import { ChannelCards } from "@/components/channel-cards";
import { getChannels } from "@/lib/bridge-client";
import { requirePermission } from "@/lib/auth/current-user";
import type { Channel } from "@openclaw-manager/types";

export const metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  await requirePermission("channels.view");
  let channels: Channel[] = [];
  let fetchError: string | null = null;
  try {
    channels = await getChannels();
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Failed to load channels";
  }

  return (
    <AppShell title="Channels">
      <div className="content">
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
        <ChannelCards initial={channels} />
      </div>
    </AppShell>
  );
}
