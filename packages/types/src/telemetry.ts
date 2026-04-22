// packages/types/src/telemetry.ts
export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export const TELEMETRY_LIMITS = {
  maxEventBytes: 8 * 1024,
  maxContextKeys: 16,
  maxIdentityLen: 128,
  maxRouteLen: 512,
  maxContextValueLen: 512,
} as const;

export type TelemetryOutcome = "invoked" | "succeeded" | "failed";
export type TelemetryActorType = "user" | "system";
export type TelemetrySource = "dashboard";
export type TelemetrySurface = "web";

export interface TelemetryTarget {
  type: string;
  id?: string;
}

export interface TelemetryActor {
  type: TelemetryActorType;
  id: string;
}

// Client submission shape — no canonical ts.
export interface TelemetryEventInput {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  eventId: string;
  clientTs?: string;
  source: TelemetrySource;
  surface?: TelemetrySurface;
  sessionId?: string;
  actor: TelemetryActor;
  feature: string;
  action: string;
  target?: TelemetryTarget;
  route: string;
  outcome?: TelemetryOutcome;
  errorCode?: string;
  traceId?: string;
  context?: Record<string, string | number | boolean>;
}

// Stored shape — bridge adds canonical ts.
export interface TelemetryEvent extends TelemetryEventInput {
  ts: string;
}

export interface TelemetryQueryResponse {
  events: TelemetryEvent[];
  nextCursor: string | null;
  prevCursor: string | null;
}

export type ContextFieldType = "string" | "number" | "boolean";
export type ContextSchema = Record<string, ContextFieldType>;
