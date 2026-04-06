"use client";

import { useRouter } from "next/navigation";
import { useBridgeEvents } from "@/lib/ws-client";
import { LiveIndicator } from "./live-indicator";

export function AutoRefresh() {
  const router = useRouter();

  const { status } = useBridgeEvents((msg) => {
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
