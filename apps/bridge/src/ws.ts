import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import { getConversations } from "./services/openclaw-state.js";
import { readSettings } from "./services/runtime-settings.js";
import { onFileChange, startWatching } from "./services/file-watcher.js";
import { onBrainChange, onGlobalBrainChange } from "./services/brain.js";
import type { WsMessage } from "@openclaw-manager/types";

let _broadcast: (message: WsMessage) => void = () => {};

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

  const broadcastInternal = (message: WsMessage): void => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };

  _broadcast = broadcastInternal;

  // Watch files and broadcast changes
  startWatching();

  onFileChange(async (file) => {
    try {
      if (file === "state") {
        const conversations = await getConversations();
        broadcastInternal({ type: "conversations_updated", payload: conversations });
      } else if (file === "settings") {
        const settings = await readSettings();
        broadcastInternal({ type: "settings_updated", payload: settings });
      } else if (file === "events") {
        broadcastInternal({ type: "event_new", payload: { ts: Date.now() } });
      }
    } catch {
      // swallow broadcast errors
    }
  });

  onBrainChange((event) => {
    const type = event.kind === "removed" ? "brain_person_removed" : "brain_person_changed";
    broadcastInternal({ type, payload: { phone: event.phone } });
  });

  onGlobalBrainChange((event) => {
    broadcastInternal({
      type: "brain_agent_changed",
      payload: { updatedAt: new Date().toISOString(), kind: event.kind },
    });
  });

  console.log("WebSocket server attached at /ws");
}

export function broadcast(type: string, payload: unknown): void {
  _broadcast({ type: type as any, payload });
}
