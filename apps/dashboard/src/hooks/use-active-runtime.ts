"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  RuntimeConfigSnapshot,
  RuntimeKind,
} from "@openclaw-manager/types";
import { useRuntimeHealth } from "./use-runtime-health";

/**
 * Resolves the *active* runtime as the user perceives it across the
 * dashboard:
 *   1. `?runtimeId=` URL param if set, else
 *   2. `snapshot.primaryRuntimeId`.
 *
 * Returns the descriptor (kind, displayName) by joining health snapshot
 * with the runtime-config endpoint. /runtimes/health is intentionally
 * minimal and does not include `kind`/`displayName`, so this hook does
 * the join client-side and keeps both pieces of state in sync.
 */
export type ActiveRuntime = {
  runtimeId: string | null;
  kind: RuntimeKind | null;
  displayName: string | null;
};

export function useActiveRuntime(): ActiveRuntime {
  const params = useSearchParams();
  const { snapshot } = useRuntimeHealth();
  const [config, setConfig] = useState<RuntimeConfigSnapshot | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/runtime-config", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RuntimeConfigSnapshot;
        if (aliveRef.current) setConfig(data);
      } catch {
        // Keep silent — sidebar dim/badge feature is non-essential.
      }
    })();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const explicit = params?.get("runtimeId") ?? null;
  const activeId = explicit ?? snapshot?.primaryRuntimeId ?? config?.effectivePrimaryRuntimeId ?? null;
  if (!activeId) return { runtimeId: null, kind: null, displayName: null };

  const descriptor = config?.runtimes.find((r) => r.id === activeId);
  return {
    runtimeId: activeId,
    kind: descriptor?.kind ?? null,
    displayName: descriptor?.displayName ?? null,
  };
}
