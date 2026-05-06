import { requirePermissionApi, AuthFailure, resolveCurrentSession } from "@/lib/auth/current-user";
import { bridgeIssueWsTicket } from "@/lib/auth/bridge-auth-client";
import { WebSocket } from "ws";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";

function getBridgeWsUrl(ticket: string): string {
  return BRIDGE_URL.replace(/^http/, "ws") + `/ws?ticket=${encodeURIComponent(ticket)}`;
}

export async function GET() {
  try {
    await requirePermissionApi("conversations.view");
  } catch (err) {
    if (err instanceof AuthFailure) {
      return new Response(err.message, { status: err.status });
    }
    throw err;
  }

  const session = await resolveCurrentSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  let ticket: string;
  try {
    const t = await bridgeIssueWsTicket(session.user.id, session.sid);
    ticket = t.ticket;
  } catch (err) {
    console.warn("[sse] ws-ticket failed (bridge /auth/ws-ticket):", (err as Error).message);
    return new Response("bad gateway", { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const ws = new WebSocket(getBridgeWsUrl(ticket));

      ws.on("open", () => {
        console.log("[sse] bridge ws attached");
        controller.enqueue(encoder.encode(`data: {"type":"connected","payload":{"ts":${Date.now()}}}\n\n`));
      });

      ws.on("message", (data) => {
        try {
          const text = typeof data === "string" ? data : data.toString("utf8");
          controller.enqueue(encoder.encode(`data: ${text}\n\n`));
        } catch {
          // skip malformed
        }
      });

      ws.on("close", () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      ws.on("error", (err) => {
        console.warn("[sse] bridge ws error:", (err as Error).message);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
