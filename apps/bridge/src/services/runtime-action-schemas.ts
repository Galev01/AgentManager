/**
 * Per-action payload validators for the typed RuntimeAdapter.invokeAction
 * surface. Hand-rolled (no Zod) because the contract is small and stable —
 * adding a runtime dep for these few shapes is not worth it.
 *
 * Each validator takes `unknown`, returns the typed payload on success, and
 * throws `InvalidActionPayloadError` (with structured `fieldErrors`) on
 * failure. Routes call the matching validator before dispatching to the
 * adapter; adapters never see arbitrary input.
 */
import type { RuntimeActionId, RuntimeActionPayload, JsonValue } from "@openclaw-manager/types";

export type FieldError = { path: string; message: string };

export class InvalidActionPayloadError extends Error {
  constructor(
    public action: RuntimeActionId,
    public fieldErrors: FieldError[],
  ) {
    super(`invalid payload for ${action}: ${fieldErrors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    this.name = "InvalidActionPayloadError";
  }
}

export type RuntimeActionSchema<A extends RuntimeActionId> = (input: unknown) => RuntimeActionPayload[A];

// ---------- helpers ----------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// JsonValue = null | bool | number | string | array | object. We accept any
// of these as "JSON-serialisable" for fields typed JsonValue. We do not
// enforce deep structure; any non-cyclic JSON is fine.
function isJsonValue(v: unknown): v is JsonValue {
  if (v === null) return true;
  const t = typeof v;
  if (t === "boolean" || t === "number" || t === "string") return true;
  if (Array.isArray(v)) return v.every(isJsonValue);
  if (t === "object") {
    return Object.values(v as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}

function requireObject(input: unknown, action: RuntimeActionId): Record<string, unknown> {
  if (!isObject(input)) {
    throw new InvalidActionPayloadError(action, [{ path: "", message: "payload must be an object" }]);
  }
  return input;
}

function requireString(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | undefined {
  const v = obj[field];
  if (typeof v !== "string" || v.length === 0) {
    errors.push({ path: field, message: "must be a non-empty string" });
    return undefined;
  }
  return v;
}

function optionalString(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | undefined {
  if (!(field in obj) || obj[field] === undefined) return undefined;
  const v = obj[field];
  if (typeof v !== "string") {
    errors.push({ path: field, message: "must be a string when present" });
    return undefined;
  }
  return v;
}

function requireBoolean(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): boolean | undefined {
  const v = obj[field];
  if (typeof v !== "boolean") {
    errors.push({ path: field, message: "must be a boolean" });
    return undefined;
  }
  return v;
}

function requireJsonValue(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): JsonValue | undefined {
  if (!(field in obj)) {
    errors.push({ path: field, message: "is required" });
    return undefined;
  }
  const v = obj[field];
  if (!isJsonValue(v)) {
    errors.push({ path: field, message: "must be JSON-serialisable" });
    return undefined;
  }
  return v;
}

function optionalJsonValue(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): JsonValue | undefined {
  if (!(field in obj) || obj[field] === undefined) return undefined;
  const v = obj[field];
  if (!isJsonValue(v)) {
    errors.push({ path: field, message: "must be JSON-serialisable when present" });
    return undefined;
  }
  return v;
}

function requireRecord(
  obj: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): Record<string, unknown> | undefined {
  const v = obj[field];
  if (!isObject(v)) {
    errors.push({ path: field, message: "must be an object" });
    return undefined;
  }
  return v;
}

function throwIfErrors(action: RuntimeActionId, errors: FieldError[]): void {
  if (errors.length > 0) throw new InvalidActionPayloadError(action, errors);
}

// ---------- validators ----------

const agentsCreate: RuntimeActionSchema<"agents.create"> = (input) => {
  const obj = requireObject(input, "agents.create");
  const errors: FieldError[] = [];
  const name = requireString(obj, "name", errors);
  const workspace = requireString(obj, "workspace", errors);
  const emoji = optionalString(obj, "emoji", errors);
  const avatar = optionalString(obj, "avatar", errors);
  const model = optionalString(obj, "model", errors);
  throwIfErrors("agents.create", errors);
  return { name: name!, workspace: workspace!, emoji, avatar, model };
};

const agentsUpdate: RuntimeActionSchema<"agents.update"> = (input) => {
  const obj = requireObject(input, "agents.update");
  const errors: FieldError[] = [];
  const name = requireString(obj, "name", errors);
  const updates = requireRecord(obj, "updates", errors);
  throwIfErrors("agents.update", errors);
  return { name: name!, updates: updates! };
};

const agentsDelete: RuntimeActionSchema<"agents.delete"> = (input) => {
  const obj = requireObject(input, "agents.delete");
  const errors: FieldError[] = [];
  const name = requireString(obj, "name", errors);
  throwIfErrors("agents.delete", errors);
  return { name: name! };
};

const channelsConnect: RuntimeActionSchema<"channels.connect"> = (input) => {
  const obj = requireObject(input, "channels.connect");
  const errors: FieldError[] = [];
  const channelId = requireString(obj, "channelId", errors);
  const config = optionalJsonValue(obj, "config", errors);
  throwIfErrors("channels.connect", errors);
  return { channelId: channelId!, config };
};

const channelsDisconnect: RuntimeActionSchema<"channels.disconnect"> = (input) => {
  const obj = requireObject(input, "channels.disconnect");
  const errors: FieldError[] = [];
  const channelId = requireString(obj, "channelId", errors);
  throwIfErrors("channels.disconnect", errors);
  return { channelId: channelId! };
};

const toolsInvoke: RuntimeActionSchema<"tools.invoke"> = (input) => {
  const obj = requireObject(input, "tools.invoke");
  const errors: FieldError[] = [];
  const toolId = requireString(obj, "toolId", errors);
  const inputVal = requireJsonValue(obj, "input", errors);
  throwIfErrors("tools.invoke", errors);
  return { toolId: toolId!, input: inputVal! };
};

const cronWrite: RuntimeActionSchema<"cron.write"> = (input) => {
  const obj = requireObject(input, "cron.write");
  const errors: FieldError[] = [];
  const id = optionalString(obj, "id", errors);
  const spec = requireRecord(obj, "spec", errors);
  let cron: string | undefined;
  let payload: JsonValue | undefined;
  let enabled: boolean | undefined;
  if (spec) {
    cron = requireString(spec, "spec.cron", []);
    if (!cron) {
      const v = spec.cron;
      if (typeof v !== "string" || v.length === 0) errors.push({ path: "spec.cron", message: "must be a non-empty string" });
      else cron = v;
    }
    payload = requireJsonValue(spec, "spec.payload", []);
    if (payload === undefined) {
      if (!("payload" in spec)) errors.push({ path: "spec.payload", message: "is required" });
      else if (!isJsonValue(spec.payload)) errors.push({ path: "spec.payload", message: "must be JSON-serialisable" });
      else payload = spec.payload as JsonValue;
    }
    enabled = requireBoolean(spec, "spec.enabled", []);
    if (enabled === undefined) {
      if (typeof spec.enabled !== "boolean") errors.push({ path: "spec.enabled", message: "must be a boolean" });
      else enabled = spec.enabled;
    }
  }
  throwIfErrors("cron.write", errors);
  return { id, spec: { cron: cron!, payload: payload!, enabled: enabled! } };
};

const cronDelete: RuntimeActionSchema<"cron.delete"> = (input) => {
  const obj = requireObject(input, "cron.delete");
  const errors: FieldError[] = [];
  const id = requireString(obj, "id", errors);
  throwIfErrors("cron.delete", errors);
  return { id: id! };
};

const claudeCodeAsk: RuntimeActionSchema<"claudeCode.ask"> = (input) => {
  const obj = requireObject(input, "claudeCode.ask");
  const errors: FieldError[] = [];
  const ide = requireString(obj, "ide", errors);
  const workspace = requireString(obj, "workspace", errors);
  const msgId = requireString(obj, "msgId", errors);
  const question = requireString(obj, "question", errors);
  const sessionId = optionalString(obj, "sessionId", errors);
  const gatewayKey = optionalString(obj, "gatewayKey", errors);
  const firstTurnMessage = optionalString(obj, "firstTurnMessage", errors);
  // intervalMs / timeoutMs are tuning hints; accept numbers or undefined.
  const replyPollIntervalMs =
    typeof obj.replyPollIntervalMs === "number" ? obj.replyPollIntervalMs : undefined;
  const replyTimeoutMs =
    typeof obj.replyTimeoutMs === "number" ? obj.replyTimeoutMs : undefined;
  throwIfErrors("claudeCode.ask", errors);
  return {
    ide: ide!, workspace: workspace!, msgId: msgId!, question: question!,
    sessionId, gatewayKey, firstTurnMessage,
    replyPollIntervalMs, replyTimeoutMs,
  };
};

const sessionsCreate: RuntimeActionSchema<"sessions.create"> = (input) => {
  const obj = requireObject(input, "sessions.create");
  const errors: FieldError[] = [];
  const agentName = optionalString(obj, "agentName", errors);
  throwIfErrors("sessions.create", errors);
  return { agentName };
};

const sessionsSend: RuntimeActionSchema<"sessions.send"> = (input) => {
  const obj = requireObject(input, "sessions.send");
  const errors: FieldError[] = [];
  const sessionKey = requireString(obj, "sessionKey", errors);
  const message = requireString(obj, "message", errors);
  throwIfErrors("sessions.send", errors);
  // awaitCompletion and timeoutMs are optional; pass through as-is.
  const awaitCompletion = "awaitCompletion" in obj && obj.awaitCompletion === true ? true : undefined;
  const timeoutMs = typeof obj.timeoutMs === "number" ? obj.timeoutMs : undefined;
  return { sessionKey: sessionKey!, message: message!, awaitCompletion, timeoutMs };
};

const sessionsReset: RuntimeActionSchema<"sessions.reset"> = (input) => {
  const obj = requireObject(input, "sessions.reset");
  const errors: FieldError[] = [];
  const sessionKey = requireString(obj, "sessionKey", errors);
  throwIfErrors("sessions.reset", errors);
  return { sessionKey: sessionKey! };
};

const sessionsAbort: RuntimeActionSchema<"sessions.abort"> = (input) => {
  const obj = requireObject(input, "sessions.abort");
  const errors: FieldError[] = [];
  const sessionKey = requireString(obj, "sessionKey", errors);
  throwIfErrors("sessions.abort", errors);
  return { sessionKey: sessionKey! };
};

const sessionsCompact: RuntimeActionSchema<"sessions.compact"> = (input) => {
  const obj = requireObject(input, "sessions.compact");
  const errors: FieldError[] = [];
  const sessionKey = requireString(obj, "sessionKey", errors);
  throwIfErrors("sessions.compact", errors);
  return { sessionKey: sessionKey! };
};

const sessionsDelete: RuntimeActionSchema<"sessions.delete"> = (input) => {
  const obj = requireObject(input, "sessions.delete");
  const errors: FieldError[] = [];
  const sessionKey = requireString(obj, "sessionKey", errors);
  throwIfErrors("sessions.delete", errors);
  return { sessionKey: sessionKey! };
};

const cronRun: RuntimeActionSchema<"cron.run"> = (input) => {
  const obj = requireObject(input, "cron.run");
  const errors: FieldError[] = [];
  const id = requireString(obj, "id", errors);
  throwIfErrors("cron.run", errors);
  return { id: id! };
};

const memoryWrite: RuntimeActionSchema<"memory.write"> = (input) => {
  const obj = requireObject(input, "memory.write");
  const errors: FieldError[] = [];
  const key = requireString(obj, "key", errors);
  const value = requireJsonValue(obj, "value", errors);
  throwIfErrors("memory.write", errors);
  return { key: key!, value: value! };
};

const skillsInstall: RuntimeActionSchema<"skills.install"> = (input) => {
  const obj = requireObject(input, "skills.install");
  const errors: FieldError[] = [];
  const ref = requireString(obj, "ref", errors);
  throwIfErrors("skills.install", errors);
  return { ref: ref! };
};

const configSet: RuntimeActionSchema<"config.set"> = (input) => {
  const obj = requireObject(input, "config.set");
  const errors: FieldError[] = [];
  const path = requireString(obj, "path", errors);
  const value = requireJsonValue(obj, "value", errors);
  throwIfErrors("config.set", errors);
  return { path: path!, value: value! };
};

export const runtimeActionSchemas: { [A in RuntimeActionId]: RuntimeActionSchema<A> } = {
  "agents.create": agentsCreate,
  "agents.update": agentsUpdate,
  "agents.delete": agentsDelete,
  "channels.connect": channelsConnect,
  "channels.disconnect": channelsDisconnect,
  "tools.invoke": toolsInvoke,
  "cron.write": cronWrite,
  "cron.delete": cronDelete,
  "cron.run": cronRun,
  "claudeCode.ask": claudeCodeAsk,
  "sessions.create": sessionsCreate,
  "sessions.send": sessionsSend,
  "sessions.reset": sessionsReset,
  "sessions.abort": sessionsAbort,
  "sessions.compact": sessionsCompact,
  "sessions.delete": sessionsDelete,
  "memory.write": memoryWrite,
  "skills.install": skillsInstall,
  "config.set": configSet,
};
