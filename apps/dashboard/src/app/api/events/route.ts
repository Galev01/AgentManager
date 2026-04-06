import { isAuthenticated } from "@/lib/session";
import { WebSocket } from "ws";

const BRIDGE_URL = process.env.OPENCLAW_BRIDGE_URL || "http://localhost:3100";
const BRIDGE_TOKEN = process.env.OPENCLAW_BRIDGE_TOKEN || "";

function getBridgeWsUrl(): string {
  return BRIDGE_URL.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(BRIDGE_TOKEN)}`;
}

export async function GET() {
  const authed = await isAuthenticated();
  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const wsUrl = getBridgeWsUrl();
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
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

      ws.on("error", () => {
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
