// Wire-safe JSON for anything that crosses the bridge boundary. Adapter
// results and native refs must be JSON-serialisable so dashboard and audit
// consumers never see non-cloneable values.
export type JsonValue =
  | null | boolean | number | string
  | JsonValue[] | { [k: string]: JsonValue };

export type RuntimeKind = "openclaw" | "hermes" | "zeroclaw" | "nanobot";

export type ProjectionMode = "exact" | "partial" | "inferred";

export type Lossiness = "none" | "lossy";

export type RuntimeDescriptor = {
  id: string;                    // stable, human-set ("oc-main", "hermes-prod")
  kind: RuntimeKind;
  displayName: string;
  endpoint: string;              // primary URL (HTTP, WS, or "mcp:stdio:<bin>")
  transport: "http" | "ws" | "mcp-stdio" | "sdk";
  authMode: "bearer" | "token-env" | "mcp-none";
  healthPath?: string;           // override default "/health" when the runtime uses a different probe path
  notes?: string;
  enabled?: boolean;             // missing = true (back-compat)
};

// Reads are capability-gated but never go through invokeAction.
export type RuntimeReadCapabilityId =
  | "agents.list" | "agents.read"
  | "sessions.list" | "sessions.read" | "sessions.usage"
  | "channels.list" | "channels.status"
  | "memory.query"
  | "skills.list"
  | "tools.list" | "tools.effective"
  | "cron.list" | "cron.status"
  | "models.list"
  | "logs.tail"
  | "config.get";

// Writes flow through invokeAction with typed payloads.
export type RuntimeActionId =
  | "agents.create" | "agents.update" | "agents.delete"
  | "channels.connect" | "channels.disconnect"
  | "tools.invoke"
  | "cron.write" | "cron.delete" | "cron.run"
  | "claudeCode.ask"
  | "sessions.create" | "sessions.send" | "sessions.reset" | "sessions.abort" | "sessions.compact" | "sessions.delete"
  | "memory.write"
  | "skills.install"
  | "config.set";

// Every capability id (read OR action) is gated through the same matrix.
export type CapabilityId = RuntimeReadCapabilityId | RuntimeActionId;

// A partial capability must explain *why* so the dashboard can render honest
// degradation instead of a silent amber badge. Examples:
//   { id: "sessions.list", reason: "no pagination exposed", lossiness: "lossy", projectionMode: "partial" }
//   { id: "logs.tail", reason: "lines-only, no structured events", lossiness: "lossy", projectionMode: "inferred" }
export type PartialCapability = {
  id: CapabilityId;
  reason: string;
  projectionMode: ProjectionMode;
  lossiness: Lossiness;
};

export type RuntimeStatus =
  | { state: "disabled" }
  | { state: "healthy"; detail?: string }
  | { state: "unhealthy"; detail: string };

export type CapabilitySnapshot = {
  supported: CapabilityId[];
  partial: PartialCapability[];
  unsupported: CapabilityId[];
  version: string;                 // adapter contract version
  runtimeVersion?: string;         // reported by the runtime if available
  source: "runtime-reported" | "static-adapter";
  stale: boolean;
};

export type FallbackReason =
  | "configured_primary_disabled"
  | "configured_primary_missing";

export type RuntimeConfigDescriptor = RuntimeDescriptor & {
  enabled: boolean;             // resolved (defaulted) by registry/service
  status: RuntimeStatus;
};

export type RuntimeConfigSnapshot = {
  configuredPrimaryRuntimeId: string | null;
  effectivePrimaryRuntimeId: string | null;
  fallbackReason: FallbackReason | null;
  runtimes: RuntimeConfigDescriptor[];
};

export type RuntimeConfigPatch = {
  configuredPrimaryRuntimeId?: string;
  enabled?: { [runtimeId: string]: boolean };
};

export type RuntimeEntityKind =
  | "agent" | "session" | "channel" | "skill" | "tool" | "cron" | "memory" | "model";

export type RuntimeEntity = {
  runtimeKind: RuntimeKind;
  runtimeId: string;
  entityKind: RuntimeEntityKind;
  entityId: string;                // native id as returned by the runtime
  displayName: string;
  nativeType?: string;             // e.g. Hermes "skill.python" or ZeroClaw "channel.telegram"
  lastActivityAt?: number;         // epoch ms
  nativeRef?: JsonValue;           // verbatim runtime payload, for debugging + lossiness inspection
};

export type RuntimeActivityEvent = {
  runtimeKind: RuntimeKind;
  runtimeId: string;
  eventKind:
    | "message_in" | "message_out"
    | "session_started" | "session_ended"
    | "tool_invoked" | "tool_result"
    | "skill_run" | "cron_fired"
    | "channel_connected" | "channel_disconnected"
    | "error";
  at: number;                      // epoch ms
  entityId?: string;
  text?: string;
  projectionMode: ProjectionMode;
  lossiness: Lossiness;
  nativeRef?: JsonValue;
};

export type RuntimeAuthMode = {
  id: "service" | "delegated" | "asserted";
  label: string;
  description: string;
};

// ActorAssertionRef is bridge-stamped, never caller-supplied. The bridge
// route derives humanActorUserId from req.auth.user.id and the service id
// from config; callers only supply action + payload + optional runtimeActorId
// (if Phase 2 delegated mode is used).
export type ActorAssertionRef = {
  humanActorUserId: string;
  managerServiceId: string;
  runtimeActorId?: string;
  basis: "service-principal" | "delegated" | "assertion";
};

// What the HTTP client sends. Note: actor is deliberately absent — the bridge
// constructs it from the authenticated request context.
export type InvokeActionHttpRequest = {
  action: string;
  targetEntityId?: string;
  payload: JsonValue;
  runtimeActorId?: string;         // optional Phase-2 delegated mode hint
};

// What the adapter receives. Bridge-internal shape with the constructed actor.
export type InvokeActionRequest = InvokeActionHttpRequest & {
  actor: ActorAssertionRef;
};

export type InvokeActionResult<T extends JsonValue = JsonValue> =
  | { ok: true; nativeResult: T; projectionMode: ProjectionMode }
  | { ok: false; error: string; projectionMode: ProjectionMode };

// Result type for the typed invokeAction surface. Same shape as the legacy
// InvokeActionResult; aliased here so adapters can express intent without
// pulling the JsonValue generic.
export type RuntimeActionResult = InvokeActionResult;

// Per-action payload contract. Every entry in RuntimeActionId must have
// exactly one entry here. Bridge route layer validates input against this
// shape via runtimeActionSchemas before dispatching to the adapter.
export type RuntimeActionPayload = {
  "agents.create": { name: string; workspace: string; emoji?: string; avatar?: string; model?: string };
  "agents.update": { name: string; updates: Record<string, unknown> };
  "agents.delete": { name: string };
  "channels.connect": { channelId: string; config?: JsonValue };
  "channels.disconnect": { channelId: string };
  "tools.invoke": { toolId: string; input: JsonValue };
  "cron.write": { id?: string; spec: { cron: string; payload: JsonValue; enabled: boolean } };
  "cron.delete": { id: string };
  "claudeCode.ask": { ide: string; workspace: string; msgId: string; question: string; sessionId?: string };
  "sessions.create": { agentName?: string };
  "sessions.send": {
    sessionKey: string;
    message: string;
    /**
     * When true, adapter waits for terminal status and returns
     * `{ assistantText, elapsedMs, sessionKey }` in nativeResult.
     * When false/undefined, adapter returns `{ ack: true, sessionKey }`
     * (existing fire-and-forget shape).
     */
    awaitCompletion?: boolean;
    /** Default 120000. Only used when awaitCompletion=true. */
    timeoutMs?: number;
  };
  "sessions.reset":   { sessionKey: string };
  "sessions.abort":   { sessionKey: string };
  "sessions.compact": { sessionKey: string };
  "sessions.delete":  { sessionKey: string };
  "cron.run":         { id: string };
  "memory.write": { key: string; value: JsonValue };
  "skills.install": { ref: string };
  "config.set": { path: string; value: JsonValue };
};

// Action context: bridge-stamped, never caller-supplied.
export type RuntimeActionContext = {
  actor: ActorAssertionRef;
  resourceRuntimeId?: string; // when mutating an existing resource
};

export interface RuntimeAdapter {
  describeRuntime(): Promise<RuntimeDescriptor>;
  getCapabilities(): Promise<CapabilitySnapshot>;
  listEntities(kind: RuntimeEntityKind, filters?: JsonValue): Promise<RuntimeEntity[]>;
  getEntity(kind: RuntimeEntityKind, id: string): Promise<RuntimeEntity | null>;
  listActivity(sinceMs?: number, limit?: number): Promise<RuntimeActivityEvent[]>;
  // Typed mutation surface. Action ids are a closed union; payload shape is
  // dictated by RuntimeActionPayload[A]; context is bridge-stamped. Bridge
  // routes validate the payload against the shared schemas before calling.
  invokeAction<A extends RuntimeActionId>(
    action: A,
    payload: RuntimeActionPayload[A],
    context: RuntimeActionContext,
  ): Promise<RuntimeActionResult>;
  getAuthModes(): Promise<RuntimeAuthMode[]>;
  getExtensions(): Promise<string[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  // Phase 1 adapters that hold long-lived resources (Nanobot MCP subprocess)
  // must implement dispose(). Others may leave it undefined; the registry
  // treats undefined as no-op.
  dispose?(): Promise<void>;
  /**
   * Optional per-capability read surface. Used for read capabilities that
   * don't fit `listEntities` (e.g. sessions.usage on a single session,
   * cron.status, tools.effective). Adapters that support a given read
   * capability implement this; routes call requireCapability first then
   * dispatch through here. Adapters that don't implement read are treated
   * as not supporting any read capability beyond listEntities.
   */
  read?(capabilityId: RuntimeReadCapabilityId, params?: JsonValue): Promise<JsonValue>;
}
