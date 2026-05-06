"use client";
import { useCallback, useEffect, useState } from "react";
import type { CopilotSessionSnapshot } from "@openclaw-manager/types";

export function useSessionSnapshot(sessionId: string | null) {
  const [snapshot, setSnapshot] = useState<CopilotSessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!sessionId) { setSnapshot(null); return; }
    try {
      const res = await fetch(`/api/copilot/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      setSnapshot(await res.json());
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "load failed"); setSnapshot(null); }
  }, [sessionId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { snapshot, error, refetch };
}
