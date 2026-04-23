"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  RuntimeSettingsV2,
  RelayRecipient,
  RoutingRule,
  Channel,
} from "@openclaw-manager/types";
import { useBridgeEvents } from "@/lib/ws-client";
import { Button, PageHeader } from "@/components/ui";
import { ToastProvider } from "./toast";
import { useDirtySignal } from "./dirty-signal";
import { RuntimeSection } from "./runtime-section";
import { RecipientsSection } from "./recipients-section";
import { RoutingSection } from "./routing-section";
import { ChannelsSection } from "./channels-section";
import { HealthSection } from "./health-section";
import { MetadataSection } from "./metadata-section";

interface Props {
  initialSettings: RuntimeSettingsV2;
  initialRecipients: RelayRecipient[];
  initialRules: RoutingRule[];
  initialChannels: Channel[];
}

export function SettingsView({
  initialSettings,
  initialRecipients,
  initialRules,
  initialChannels,
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const dirtySignal = useDirtySignal();

  useBridgeEvents((msg) => {
    if (msg.type === "settings_updated" && !dirtySignal.get()) router.refresh();
  });

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <ToastProvider>
      <div
        className="mx-auto"
        style={{
          maxWidth: 1100,
          width: "100%",
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--row-gap)",
        }}
      >
        <PageHeader
          title="Settings"
          description="Runtime behavior, relay recipients, routing, channel state, and system health."
          actions={
            <>
              <Button variant="ghost" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push("/config")}
              >
                Raw config
              </Button>
            </>
          }
        />
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 11.5,
            color: "var(--text-muted)",
            padding: "4px 0",
          }}
        >
          <a href="#runtime">Runtime</a>
          <span>·</span>
          <a href="#recipients">Recipients</a>
          <span>·</span>
          <a href="#routing">Routing</a>
          <span>·</span>
          <a href="#channels">Channels</a>
          <span>·</span>
          <a href="#health">Health</a>
          <span>·</span>
          <a href="#metadata">Metadata</a>
        </div>
        <div id="runtime"><RuntimeSection settings={initialSettings} onDirtyChange={dirtySignal.set} /></div>
        <div id="recipients"><RecipientsSection recipients={initialRecipients} defaultRelayTarget={initialSettings.relayTarget} /></div>
        <div id="routing"><RoutingSection rules={initialRules} recipients={initialRecipients} /></div>
        <div id="channels"><ChannelsSection channels={initialChannels} /></div>
        <div id="health"><HealthSection settings={initialSettings} recipients={initialRecipients} /></div>
        <div id="metadata"><MetadataSection settings={initialSettings} /></div>
      </div>
    </ToastProvider>
  );
}
