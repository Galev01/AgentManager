"use client";
import { useCallback, useEffect, useState } from "react";
import type { CopilotSessionMeta } from "@openclaw-manager/types";

export function useCopilotSessions() {
  const [sessions, setSessions] = useState<CopilotSessionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/copilot/sessions");
      if (!res.ok) throw new Error(`list ${res.status}`);
      const body = await res.json();
      setSessions(body.sessions);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "load failed"); }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  return { sessions, error, refetch };
}
