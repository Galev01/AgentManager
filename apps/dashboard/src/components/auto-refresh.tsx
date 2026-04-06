"use client";

import { useRouter } from "next/navigation";
import { useBridgeWs } from "@/lib/ws-client";
import { LiveIndicator } from "./live-indicator";

type Props = {
  wsUrl: string;
};

export function AutoRefresh({ wsUrl }: Props) {
  const router = useRouter();

  const { status } = useBridgeWs(wsUrl, (msg) => {
    if (
      msg.type === "conversations_updated" ||
      msg.type === "settings_updated" ||
      msg.type === "event_new"
    ) {
      router.refresh();
    }
  });

  return <LiveIndicator status={status} />;
}
