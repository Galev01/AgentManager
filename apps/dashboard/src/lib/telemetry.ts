// apps/dashboard/src/lib/telemetry.ts
"use client";

import { useCallback } from "react";
import {
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEventInput,
  type TelemetryOutcome,
} from "@openclaw-manager/types";

const ENDPOINT = "/api/telemetry/actions";
const TAB_KEY = "ocm_tab_session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getTabSessionId(): string {
  if (typeof window === "undefined") return "server";
  const existing = sessionStorage.getItem(TAB_KEY);
  if (existing) return existing;
  const fresh = uuid();
  sessionStorage.setItem(TAB_KEY, fresh);
  return fresh;
}

export type LogActionArgs = {
  feature: string;
  action: string;
  target?: { type: string; id?: string };
  outcome?: TelemetryOutcome;
  errorCode?: string;
  traceId?: string;
  context?: Record<string, string | number | boolean>;
};

export function logActionRaw(args: LogActionArgs): void {
  const payload: TelemetryEventInput = {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    eventId: uuid(),
    clientTs: new Date().toISOString(),
    source: "dashboard",
    surface: "web",
    sessionId: getTabSessionId(),
    actor: { type: "user", id: "anon" }, // server overwrites with verified session
    feature: args.feature,
    action: args.action,
    target: args.target,
    route: typeof window !== "undefined" ? window.location.pathname : "",
    outcome: args.outcome,
    errorCode: args.errorCode,
    traceId: args.traceId,
    context: args.context,
  };
  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // fire-and-forget — never surface telemetry errors
  }
}

export function useTelemetry(): {
  logAction: (args: LogActionArgs) => void;
  trackOperation: <T>(feature: string, action: string, fn: () => Promise<T>, ctx?: LogActionArgs["context"]) => Promise<T>;
} {
  const logAction = useCallback((args: LogActionArgs) => logActionRaw(args), []);
  const trackOperation = useCallback(
    async <T,>(feature: string, action: string, fn: () => Promise<T>, ctx?: LogActionArgs["context"]): Promise<T> => {
      const traceId = uuid();
      logActionRaw({ feature, action, outcome: "invoked", traceId, context: ctx });
      try {
        const result = await fn();
        logActionRaw({ feature, action, outcome: "succeeded", traceId, context: ctx });
        return result;
      } catch (err) {
        const code = (err as { code?: unknown })?.code ?? "threw";
        logActionRaw({ feature, action, outcome: "failed", traceId, errorCode: String(code), context: ctx });
        throw err;
      }
    },
    []
  );
  return { logAction, trackOperation };
}
