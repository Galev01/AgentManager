"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeHealthSnapshot } from "@/lib/runtime-client";

/**
 * Client-side runtime health snapshot. Fetches the dashboard's
 * /api/runtimes/health proxy (which forwards to the bridge's /runtimes/health
 * aggregate). Refreshes on mount, on window focus, and on a 30s interval.
 *
 * Fail-open contract: when the proxy errors, `error` is set but `snapshot`
 * keeps the last successful payload so consumers (CapabilityGate) can
 * choose not to blank the UI on a transient hiccup.
 */
export type UseRuntimeHealth = {
  snapshot: RuntimeHealthSnapshot | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

const REFRESH_MS = 30_000;

export function useRuntimeHealth(): UseRuntimeHealth {
  const [snapshot, setSnapshot] = useState<RuntimeHealthSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/runtimes/health", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`runtime-health ${res.status}`);
      }
      const data = (await res.json()) as RuntimeHealthSnapshot;
      if (!aliveRef.current) return;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (aliveRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refetch();

    const onFocus = () => {
      void refetch();
    };
    const interval = window.setInterval(() => {
      void refetch();
    }, REFRESH_MS);
    window.addEventListener("focus", onFocus);

    return () => {
      aliveRef.current = false;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [refetch]);

  return { snapshot, isLoading, error, refetch };
}
