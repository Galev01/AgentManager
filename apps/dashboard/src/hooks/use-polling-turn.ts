"use client";
import { useEffect, useState } from "react";
import type { CopilotTurnPollResponse } from "@openclaw-manager/types";

const TERMINAL = new Set(["done", "error", "timeout"]);

export function usePollingTurn(sessionId: string | null, msgId: string | null) {
  const [response, setResponse] = useState<CopilotTurnPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !msgId) { setResponse(null); return; }
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId!)}/turn/${encodeURIComponent(msgId!)}`);
        if (!res.ok) throw new Error(`poll ${res.status}`);
        const body: CopilotTurnPollResponse = await res.json();
        if (cancelled) return;
        setResponse(body);
        if (!TERMINAL.has(body.pending.state)) {
          timer = setTimeout(tick, 1500);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "poll failed");
      }
    }
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId, msgId]);

  return { response, error };
}
