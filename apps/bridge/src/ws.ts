import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getConversations } from "./services/openclaw-state.js";
import { readSettings } from "./services/runtime-settings.js";
import { onFileChange, startWatching } from "./services/file-watcher.js";
import type { WsMessage } from "@openclaw-manager/types";

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // Authenticate via query param: ?token=<BRIDGE_TOKEN>
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") || "";
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(config.token);

    if (
      tokenBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const msg: WsMessage = { type: "connected", payload: { ts: Date.now() } };
    ws.send(JSON.stringify(msg));
  });

  function broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Watch files and broadcast changes
  startWatching();

  onFileChange(async (file) => {
    try {
      if (file === "state") {
        const conversations = await getConversations();
        broadcast({ type: "conversations_updated", payload: conversations });
      } else if (file === "settings") {
        const settings = await readSettings();
        broadcast({ type: "settings_updated", payload: settings });
      } else if (file === "events") {
        broadcast({ type: "event_new", payload: { ts: Date.now() } });
      }
    } catch {
      // swallow broadcast errors
    }
  });

  console.log("WebSocket server attached at /ws");
}
