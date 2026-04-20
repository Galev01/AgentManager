import { AppShell } from "@/components/app-shell";
import { ChannelCards } from "@/components/channel-cards";
import { getChannels } from "@/lib/bridge-client";
import type { Channel } from "@openclaw-manager/types";

export const metadata = { title: "Channels" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  let channels: Channel[] = [];
  try {
    channels = await getChannels();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Channels">
      <div className="content">
        <ChannelCards initial={channels} />
      </div>
    </AppShell>
  );
}
