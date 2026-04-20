"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationStatus } from "@openclaw-manager/types";
import { ComposeDialog } from "./compose-dialog";
import { Button } from "./ui";

type Action = "takeover" | "release" | "wake-now";

export function TakeoverControls({
  conversationKey,
  status,
  phone,
  displayName,
}: {
  conversationKey: string;
  status: ConversationStatus;
  phone?: string;
  displayName?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<Action | null>(null);
  const [composing, setComposing] = useState(false);

  const handleAction = async (action: Action) => {
    setLoading(action);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationKey)}/${action}`, {
        method: "POST",
      });
      router.refresh();
    } catch {
      // ignore
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {status !== "human" && (
          <Button
            variant="danger"
            onClick={() => handleAction("takeover")}
            disabled={loading !== null}
          >
            {loading === "takeover" ? "…" : "Enable takeover"}
          </Button>
        )}
        {status === "human" && (
          <Button
            variant="primary"
            onClick={() => handleAction("release")}
            disabled={loading !== null}
          >
            {loading === "release" ? "…" : "Release takeover"}
          </Button>
        )}
        {(status === "cold" || status === "waking") && (
          <Button
            variant="primary"
            onClick={() => handleAction("wake-now")}
            disabled={loading !== null}
          >
            {loading === "wake-now" ? "…" : "Wake now"}
          </Button>
        )}
        <Button onClick={() => setComposing(true)}>Send message</Button>
      </div>
      {composing && (
        <ComposeDialog
          conversationKey={conversationKey}
          phone={phone}
          displayName={displayName}
          onClose={() => setComposing(false)}
        />
      )}
    </>
  );
}
