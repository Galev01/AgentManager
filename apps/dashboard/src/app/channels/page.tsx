import { AppShell } from "@/components/app-shell";
import { ChannelCards } from "@/components/channel-cards";
import { getChannels } from "@/lib/bridge-client";
import type { Channel } from "@openclaw-manager/types";

export const metadata = { title: "Channels" };

export default async function ChannelsPage() {
  let channels: Channel[] = [];
  try {
    channels = await getChannels();
  } catch {
    // bridge unavailable — show empty list
  }

  return (
    <AppShell title="Channels">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Channels</h1>
          <p className="mt-1 text-sm text-zinc-400">
            View connected channel status and manage active sessions.
          </p>
        </div>
        <ChannelCards initial={channels} />
      </div>
    </AppShell>
  );
}
