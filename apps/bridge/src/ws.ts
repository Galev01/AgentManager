import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import crypto from "node:crypto";
import { config } from "./config.js";
import type { AuthService } from "./services/auth/service.js";
import { getConversations } from "./services/openclaw-state.js";
import { readSettings } from "./services/runtime-settings.js";
import { onFileChange, startWatching } from "./services/file-watcher.js";
import { onBrainChange, onGlobalBrainChange } from "./services/brain.js";
import type { WsMessage } from "@openclaw-manager/types";

let _broadcast: (message: WsMessage) => void = () => {};

export function attachWebSocket(server: Server, authService: AuthService): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const ticket = url.searchParams.get("ticket") || "";
    const bearer = url.searchParams.get("token") || "";
    if (ticket) {
      const claim = await authService.consumeWsTicket(ticket);
      if (!claim) { ws.close(4001, "Unauthorized"); return; }
    } else if (bearer) {
      const a = Buffer.from(bearer), b = Buffer.from(config.token);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        ws.close(4001, "Unauthorized");
        return;
      }
    } else { ws.close(4001, "Unauthorized"); return; }
    const msg: WsMessage = { type: "connected", payload: { ts: Date.now() } };
    ws.send(JSON.stringify(msg));
  });

  const broadcastInternal = (message: WsMessage): void => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(data);
  };
  _broadcast = broadcastInternal;
  startWatching();

  onFileChange(async (file) => {
    try {
      if (file === "state") broadcastInternal({ type: "conversations_updated", payload: await getConversations() });
      else if (file === "settings") broadcastInternal({ type: "settings_updated", payload: await readSettings() });
      else if (file === "events") broadcastInternal({ type: "event_new", payload: { ts: Date.now() } });
    } catch {}
  });
  onBrainChange((e) => {
    broadcastInternal({
      type: e.kind === "removed" ? "brain_person_removed" : "brain_person_changed",
      payload: { phone: e.phone },
    });
  });
  onGlobalBrainChange((e) => {
    broadcastInternal({ type: "brain_agent_changed", payload: { updatedAt: new Date().toISOString(), kind: e.kind } });
  });
  console.log("WebSocket server attached at /ws");
}

export function broadcast(type: string, payload: unknown): void { _broadcast({ type: type as any, payload }); }
