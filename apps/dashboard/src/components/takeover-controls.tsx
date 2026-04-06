"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConversationStatus } from "@openclaw-manager/types";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function TakeoverControls({ conversationKey, status }: { conversationKey: string; status: ConversationStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: "takeover" | "release" | "wake-now") => {
    setLoading(action);
    try {
      await fetch(`/api/conversations/${encodeURIComponent(conversationKey)}/${action}`, { method: "POST" });
      router.refresh();
    } catch {} finally { setLoading(null); }
  };

  return (
    <div className="flex flex-wrap gap-3">
      {status !== "human" && (
        <button onClick={() => handleAction("takeover")} disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-danger py-2.5 px-5 text-sm font-medium text-white transition hover:bg-danger/80 disabled:cursor-not-allowed disabled:opacity-50">
          {loading === "takeover" && <Spinner />} Enable Takeover
        </button>
      )}
      {status === "human" && (
        <button onClick={() => handleAction("release")} disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-success py-2.5 px-5 text-sm font-medium text-white transition hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-50">
          {loading === "release" && <Spinner />} Release Takeover
        </button>
      )}
      {(status === "cold" || status === "waking") && (
        <button onClick={() => handleAction("wake-now")} disabled={loading !== null}
          className="inline-flex items-center gap-2 rounded bg-primary py-2.5 px-5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          {loading === "wake-now" && <Spinner />} Wake Now
        </button>
      )}
    </div>
  );
}
