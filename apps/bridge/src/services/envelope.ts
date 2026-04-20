import crypto from "node:crypto";
import type {
  CCArtifact,
  CCAuthor,
  CCAuthorKind,
  CCAuthorState,
  CCEnvelope,
  CCEnvelopeInput,
  CCIntent,
  CCPriority,
  CCRef,
  CCState,
} from "@openclaw-manager/types";

const INTENTS: readonly CCIntent[] = [
  "decide",
  "brainstorm",
  "plan",
  "review",
  "research",
  "unblock",
  "handoff",
  "report",
] as const;

const AUTHOR_STATES: readonly CCAuthorState[] = [
  "new",
  "in_progress",
  "blocked",
  "review_ready",
  "done",
  "parked",
] as const;

const ARTIFACTS: readonly CCArtifact[] = [
  "none",
  "question",
  "decision",
  "spec",
  "plan",
  "review_notes",
  "patch",
  "summary",
] as const;

const PRIORITIES: readonly CCPriority[] = ["low", "normal", "high", "urgent"] as const;

const REF_KINDS = new Set(["file", "commit", "spec", "error", "session"]);
const REF_RELATIONS = new Set([
  "background",
  "source_of_truth",
  "prior_attempt",
  "parallel_work",
]);

export function newMsgId(): string {
  return `m-${crypto.randomBytes(6).toString("hex")}`;
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): { value: T; raw?: string } {
  if (typeof value !== "string") return { value: fallback };
  if ((allowed as readonly string[]).includes(value)) return { value: value as T };
  return { value: fallback, raw: value };
}

function coerceRef(item: unknown): { ref: CCRef | null; raw?: unknown } {
  if (!item || typeof item !== "object") return { ref: null, raw: item };
  const rec = item as Record<string, unknown>;
  const kind = rec.kind;
  if (typeof kind !== "string" || !REF_KINDS.has(kind)) return { ref: null, raw: item };
  const relation =
    typeof rec.relation === "string" && REF_RELATIONS.has(rec.relation)
      ? (rec.relation as CCRef["relation"])
      : undefined;
  switch (kind) {
    case "file": {
      if (typeof rec.path !== "string") return { ref: null, raw: item };
      const range = typeof rec.range === "string" ? rec.range : undefined;
      return { ref: { kind: "file", path: rec.path, range, relation } };
    }
    case "commit": {
      if (typeof rec.sha !== "string") return { ref: null, raw: item };
      return { ref: { kind: "commit", sha: rec.sha, relation } };
    }
    case "spec": {
      if (typeof rec.path !== "string") return { ref: null, raw: item };
      return { ref: { kind: "spec", path: rec.path, relation } };
    }
    case "error": {
      if (typeof rec.text !== "string") return { ref: null, raw: item };
      return { ref: { kind: "error", text: rec.text, relation } };
    }
    case "session": {
      if (typeof rec.id !== "string") return { ref: null, raw: item };
      return { ref: { kind: "session", id: rec.id, relation } };
    }
    default:
      return { ref: null, raw: item };
  }
}

/** Map legacy `context` keys (file, selection, stack) onto typed refs. */
export function contextToRefs(context: Record<string, unknown> | undefined): CCRef[] {
  if (!context) return [];
  const refs: CCRef[] = [];
  if (typeof context.file === "string") {
    const range = typeof context.range === "string" ? context.range : undefined;
    refs.push({ kind: "file", path: context.file, range });
  }
  if (typeof context.selection === "string" && !context.file) {
    // Selection without a file is best captured as a freeform error-style note.
    refs.push({ kind: "error", text: context.selection });
  }
  if (typeof context.stack === "string") {
    refs.push({ kind: "error", text: context.stack });
  }
  return refs;
}

export type AuthorContext =
  | { kind: "ide"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "operator"; id: string }
  | { kind: "system"; id: "bridge" | "gateway" };

export function deriveAuthor(ctx: AuthorContext): CCAuthor {
  const id = ctx.id && typeof ctx.id === "string" ? ctx.id : "unknown";
  const kind: CCAuthorKind = ctx.kind;
  return { kind, id };
}

export type NormalizeOptions = {
  /** Transport-derived author; always overrides caller-supplied author. */
  authorContext: AuthorContext;
  /** When the caller omits parentMsgId but we know the thread, supply it. */
  parentMsgIdFallback?: string | null;
  /** When `true`, the bridge treats an absent state as `in_progress` rather
   *  than `new`. Use for turns mid-thread. */
  midThread?: boolean;
  /** Existing msgIds in this session, used to detect duplicates. */
  existingMsgIds?: ReadonlySet<string>;
};

/** Normalize permissive caller input into a canonical CCEnvelope.
 *  Never throws for malformed fields except when `message` is missing/empty. */
export function normalizeEnvelope(
  input: CCEnvelopeInput & { context?: Record<string, unknown> },
  opts: NormalizeOptions
): CCEnvelope {
  if (!input || typeof input.message !== "string" || input.message.trim() === "") {
    throw new Error("message required");
  }

  const raw: CCEnvelope["_raw"] = {};

  const intentCoerced = coerceEnum<CCIntent>(input.intent, INTENTS, "report");
  if (intentCoerced.raw !== undefined) raw.intent = intentCoerced.raw;

  const defaultState: CCAuthorState = opts.midThread ? "in_progress" : "new";
  const stateCoerced = coerceEnum<CCAuthorState>(input.state, AUTHOR_STATES, defaultState);
  if (stateCoerced.raw !== undefined) raw.state = stateCoerced.raw;

  const artifactCoerced = coerceEnum<CCArtifact>(input.artifact, ARTIFACTS, "none");
  if (artifactCoerced.raw !== undefined) raw.artifact = artifactCoerced.raw;

  const priorityCoerced = coerceEnum<CCPriority>(input.priority, PRIORITIES, "normal");

  const refsIn = Array.isArray(input.refs) ? input.refs : [];
  const contextRefs = contextToRefs((input as unknown as { context?: Record<string, unknown> }).context);
  const combined: unknown[] = [...refsIn, ...contextRefs];
  const refs: CCRef[] = [];
  const rejectedRefs: unknown[] = [];
  for (const r of combined) {
    const { ref, raw: rr } = coerceRef(r);
    if (ref) refs.push(ref);
    else rejectedRefs.push(rr ?? r);
  }
  if (rejectedRefs.length) raw.refs = rejectedRefs;

  // msgId: accept caller's if well-formed and unique; else bridge-assign.
  let msgId = typeof input.msgId === "string" && /^m-[a-f0-9]{6,32}$/.test(input.msgId)
    ? input.msgId
    : newMsgId();
  if (opts.existingMsgIds && opts.existingMsgIds.has(msgId)) {
    msgId = newMsgId();
  }

  const parentMsgId =
    typeof input.parentMsgId === "string" && input.parentMsgId.length > 0
      ? input.parentMsgId
      : opts.parentMsgIdFallback ?? null;

  const author = deriveAuthor(opts.authorContext);

  const envelope: CCEnvelope = {
    msgId,
    parentMsgId,
    author,
    intent: intentCoerced.value,
    state: stateCoerced.value,
    artifact: artifactCoerced.value,
    priority: priorityCoerced.value,
    refs,
    message: input.message,
  };

  if (Object.keys(raw).length > 0) envelope._raw = raw;
  if (!input.intent) envelope._intentConfidence = "low";

  return envelope;
}

/** Construct a system-authored envelope for events like timeouts. */
export function systemEnvelope(
  message: string,
  state: CCState,
  sourceId: "bridge" | "gateway",
  parentMsgId: string | null
): CCEnvelope {
  return {
    msgId: newMsgId(),
    parentMsgId,
    author: { kind: "system", id: sourceId },
    intent: "report",
    state,
    artifact: "none",
    priority: "normal",
    refs: [],
    message,
  };
}
