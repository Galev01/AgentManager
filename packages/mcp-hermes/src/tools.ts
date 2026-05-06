import type { SessionStore } from "./sessions.js";
import type { ShimClient } from "./shim-client.js";

export interface ToolHandlerCtx {
  args: Record<string, unknown>;
  clientId: string;
  store: SessionStore;
  shim: Pick<ShimClient, "chat">;
}

export interface ToolTextResult { text: string }

export async function handleHermesSay(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const message = String(ctx.args.message ?? "");
  if (!message) throw new Error("message required");
  const sessionId = typeof ctx.args.session_id === "string" && ctx.args.session_id
    ? ctx.args.session_id
    : undefined;
  const entry = ctx.store.getOrCreate(ctx.clientId, sessionId);
  const reply = await ctx.shim.chat({ session_id: entry.sessionId, message });
  ctx.store.incrementMessageCount(ctx.clientId, entry.sessionId);
  const after = ctx.store.get(ctx.clientId, entry.sessionId)!;
  return {
    text: JSON.stringify({
      session_id: after.sessionId,
      reply: reply.assistantText,
      message_count: after.messageCount,
      elapsed_ms: reply.elapsedMs,
    }, null, 2),
  };
}

export async function handleHermesSessionInfo(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const requestedId = typeof ctx.args.session_id === "string" ? ctx.args.session_id : undefined;
  if (!requestedId) {
    const recent = ctx.store.getMostRecent(ctx.clientId);
    if (!recent) return { text: "no session yet" };
    return { text: JSON.stringify({
      session_id: recent.sessionId,
      message_count: recent.messageCount,
      status: recent.status,
      started_at: recent.startedAt,
    }, null, 2) };
  }
  const entry = ctx.store.get(ctx.clientId, requestedId);
  if (!entry) return { text: JSON.stringify({
    session_id: requestedId,
    message_count: 0,
    status: "unknown",
    started_at: 0,
  }, null, 2) };
  return { text: JSON.stringify({
    session_id: entry.sessionId,
    message_count: entry.messageCount,
    status: entry.status,
    started_at: entry.startedAt,
  }, null, 2) };
}

export async function handleHermesConclude(ctx: ToolHandlerCtx): Promise<ToolTextResult> {
  const summary = typeof ctx.args.summary === "string" ? ctx.args.summary : undefined;
  const requestedId = typeof ctx.args.session_id === "string" ? ctx.args.session_id : undefined;
  const target = requestedId
    ? ctx.store.get(ctx.clientId, requestedId)
    : ctx.store.getMostRecent(ctx.clientId);
  if (!target) return { text: "no session to conclude" };
  ctx.store.conclude(ctx.clientId, target.sessionId, summary);
  return { text: JSON.stringify({
    session_id: target.sessionId,
    status: "concluded",
  }, null, 2) };
}
