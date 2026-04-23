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
};

export type CapabilityId =
  | "agents.list" | "agents.read"
  | "sessions.list" | "sessions.read" | "sessions.send"
  | "channels.list" | "channels.status"
  | "memory.query" | "memory.write"
  | "skills.list" | "skills.install"
  | "tools.list" | "tools.invoke"
  | "cron.list" | "cron.write"
  | "logs.tail"
  | "config.get" | "config.set";

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

export type CapabilitySnapshot = {
  supported: CapabilityId[];
  partial: PartialCapability[];
  unsupported: CapabilityId[];
  version: string;                 // adapter contract version
  runtimeVersion?: string;         // reported by the runtime if available
};

export type RuntimeEntityKind =
  | "agent" | "session" | "channel" | "skill" | "tool" | "cron" | "memory";

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

export interface RuntimeAdapter {
  describeRuntime(): Promise<RuntimeDescriptor>;
  getCapabilities(): Promise<CapabilitySnapshot>;
  listEntities(kind: RuntimeEntityKind, filters?: JsonValue): Promise<RuntimeEntity[]>;
  getEntity(kind: RuntimeEntityKind, id: string): Promise<RuntimeEntity | null>;
  listActivity(sinceMs?: number, limit?: number): Promise<RuntimeActivityEvent[]>;
  invokeAction(req: InvokeActionRequest): Promise<InvokeActionResult>;
  getAuthModes(): Promise<RuntimeAuthMode[]>;
  getExtensions(): Promise<string[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  // Phase 1 adapters that hold long-lived resources (Nanobot MCP subprocess)
  // must implement dispose(). Others may leave it undefined; the registry
  // treats undefined as no-op.
  dispose?(): Promise<void>;
}
