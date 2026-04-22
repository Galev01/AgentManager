// apps/bridge/src/services/telemetry-log.ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  TELEMETRY_LIMITS,
  TELEMETRY_SCHEMA_VERSION,
  getContextSchema,
  type TelemetryEvent,
  type TelemetryEventInput,
  type TelemetryQueryResponse,
} from "@openclaw-manager/types";

export interface TelemetryLogConfig {
  dir: string;
  retentionDays: number;
  maxDiskMB: number;
}

export interface TelemetryQueryOptions {
  feature?: string | string[];
  action?: string;
  outcome?: string;
  actor?: string;
  traceId?: string;
  targetId?: string;
  q?: string;
  since?: string;
  until?: string;
  limit?: number;
}

interface Cursor {
  ts: string;
  eventId: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64");
}

function decodeCursor(s: string): Cursor | null {
  try {
    const obj = JSON.parse(Buffer.from(s, "base64").toString("utf8"));
    if (typeof obj.ts === "string" && typeof obj.eventId === "string") return obj;
  } catch {}
  return null;
}

function cmpNewerFirst(a: Cursor, b: Cursor): number {
  if (a.ts === b.ts) return a.eventId < b.eventId ? 1 : a.eventId > b.eventId ? -1 : 0;
  return a.ts < b.ts ? 1 : -1;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function validateAndNormalize(input: TelemetryEventInput, ts: string): TelemetryEvent {
  const { maxIdentityLen, maxRouteLen, maxContextKeys, maxContextValueLen } = TELEMETRY_LIMITS;
  const identityFields: Array<keyof TelemetryEventInput> = [
    "eventId", "feature", "action", "traceId", "errorCode",
  ];
  for (const k of identityFields) {
    const v = input[k];
    if (typeof v === "string" && v.length > maxIdentityLen) {
      throw new Error(`identity field too long: ${String(k)}`);
    }
  }
  if (input.actor?.id && input.actor.id.length > maxIdentityLen) {
    throw new Error("identity field too long: actor.id");
  }
  if (input.sessionId && input.sessionId.length > maxIdentityLen) {
    throw new Error("identity field too long: sessionId");
  }
  if (input.target?.id && input.target.id.length > maxIdentityLen) {
    throw new Error("identity field too long: target.id");
  }

  const route = typeof input.route === "string" ? truncate(input.route, maxRouteLen) : "";
  const schema = getContextSchema(input.feature, input.action);
  let context: Record<string, string | number | boolean> | undefined;
  if (input.context && typeof input.context === "object") {
    context = {};
    const entries = Object.entries(input.context).slice(0, maxContextKeys);
    for (const [k, v] of entries) {
      const allowed = schema ? schema[k] : undefined;
      if (!allowed) {
        console.warn(`[telemetry] dropping unknown context key "${k}" for ${input.feature}::${input.action}`);
        continue;
      }
      if (allowed === "string" && typeof v === "string") {
        if (v.length > maxContextValueLen) {
          console.warn(`[telemetry] dropping oversized context value "${k}"`);
          continue;
        }
        context[k] = v;
      } else if (allowed === "number" && typeof v === "number" && Number.isFinite(v)) {
        context[k] = v;
      } else if (allowed === "boolean" && typeof v === "boolean") {
        context[k] = v;
      } else {
        console.warn(`[telemetry] dropping invalid-type context key "${k}" for ${input.feature}::${input.action}`);
      }
    }
  }

  return {
    ...input,
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    source: "dashboard",
    route,
    context,
    ts,
  };
}

export function createTelemetryLog(cfg: TelemetryLogConfig): {
  append: (input: TelemetryEventInput) => Promise<TelemetryEvent>;
  query: (opts: TelemetryQueryOptions) => Promise<TelemetryQueryResponse>;
} {
  let writeChain: Promise<unknown> = Promise.resolve();
  let lastOverflowWarnAt = 0;

  async function fileForDay(day: string): Promise<string> {
    await fs.mkdir(cfg.dir, { recursive: true });
    return path.join(cfg.dir, `actions-${day}.jsonl`);
  }

  async function maybeWarnOverflow(): Promise<void> {
    const WINDOW_MS = 5 * 60 * 1000;
    const now = Date.now();
    if (now - lastOverflowWarnAt < WINDOW_MS) return;
    try {
      const files = await fs.readdir(cfg.dir);
      let total = 0;
      for (const f of files) {
        const st = await fs.stat(path.join(cfg.dir, f));
        total += st.size;
      }
      const mb = total / (1024 * 1024);
      if (mb > cfg.maxDiskMB) {
        console.warn(`[telemetry] disk usage ${mb.toFixed(1)} MB exceeds cap ${cfg.maxDiskMB} MB`);
        lastOverflowWarnAt = now;
      }
    } catch {}
  }

  async function appendInternal(input: TelemetryEventInput): Promise<TelemetryEvent> {
    const ts = new Date().toISOString();
    const event = validateAndNormalize(input, ts);
    const line = JSON.stringify(event);
    if (Buffer.byteLength(line, "utf8") > TELEMETRY_LIMITS.maxEventBytes) {
      throw new Error("event too large");
    }
    const file = await fileForDay(ts.slice(0, 10));
    await fs.appendFile(file, line + "\n", "utf8");
    void maybeWarnOverflow();
    return event;
  }

  async function append(input: TelemetryEventInput): Promise<TelemetryEvent> {
    const next = writeChain.then(() => appendInternal(input));
    writeChain = next.catch(() => undefined);
    return next;
  }

  async function listDayFiles(): Promise<string[]> {
    try {
      const entries = await fs.readdir(cfg.dir);
      return entries
        .filter((f) => /^actions-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  async function readFileEvents(file: string): Promise<TelemetryEvent[]> {
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.split("\n");
    const out: TelemetryEvent[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // tolerate truncated trailing line
      }
    }
    return out;
  }

  function featureMatches(event: TelemetryEvent, filter: string | string[] | undefined): boolean {
    if (!filter) return true;
    if (Array.isArray(filter)) return filter.includes(event.feature);
    return event.feature === filter;
  }

  function qMatches(event: TelemetryEvent, q: string | undefined): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    const hay = [event.feature, event.action, event.target?.id ?? "", event.traceId ?? "", event.actor.id]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  }

  async function query(opts: TelemetryQueryOptions): Promise<TelemetryQueryResponse> {
    const limit = Math.max(1, Math.min(opts.limit ?? 200, 500));
    const since = opts.since ? decodeCursor(opts.since) : null;
    const until = opts.until ? decodeCursor(opts.until) : null;
    const files = await listDayFiles();
    const MAX_SCAN_DAYS = 14;
    const collected: TelemetryEvent[] = [];
    let scanned = 0;
    for (const f of files) {
      if (scanned >= MAX_SCAN_DAYS) break;
      scanned++;
      const events = await readFileEvents(path.join(cfg.dir, f));
      for (const ev of events) {
        if (!featureMatches(ev, opts.feature)) continue;
        if (opts.action && ev.action !== opts.action) continue;
        if (opts.outcome && ev.outcome !== opts.outcome) continue;
        if (opts.actor && ev.actor.id !== opts.actor) continue;
        if (opts.traceId && ev.traceId !== opts.traceId) continue;
        if (opts.targetId && ev.target?.id !== opts.targetId) continue;
        if (!qMatches(ev, opts.q)) continue;
        const cur: Cursor = { ts: ev.ts, eventId: ev.eventId };
        if (since && cmpNewerFirst(cur, since) >= 0) continue;
        if (until && cmpNewerFirst(cur, until) <= 0) continue;
        collected.push(ev);
      }
      if (collected.length >= limit * 2) break;
    }
    collected.sort((a, b) => cmpNewerFirst({ ts: a.ts, eventId: a.eventId }, { ts: b.ts, eventId: b.eventId }));
    const page = collected.slice(0, limit);
    const nextCursor = page.length === limit && collected.length > limit
      ? encodeCursor({ ts: page[page.length - 1].ts, eventId: page[page.length - 1].eventId })
      : null;
    const prevCursor = page.length
      ? encodeCursor({ ts: page[0].ts, eventId: page[0].eventId })
      : null;
    return { events: page, nextCursor, prevCursor };
  }

  return { append, query };
}
