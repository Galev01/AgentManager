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
