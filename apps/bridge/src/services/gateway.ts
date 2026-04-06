import WebSocket from "ws";
import crypto from "node:crypto";
import { config } from "../config.js";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let ws: WebSocket | null = null;
let authenticated = false;
let connecting = false;
const pending = new Map<string, PendingRequest>();
const REQUEST_TIMEOUT_MS = 10000;
const RECONNECT_DELAY_MS = 3000;

function getWsUrl(): string {
  // Convert http(s) URL to ws(s)
  return config.gatewayUrl.replace(/^http/, "ws");
}

function connect(): Promise<void> {
  if (connecting) return Promise.resolve();
  connecting = true;
  authenticated = false;

  return new Promise<void>((resolve, reject) => {
    const url = getWsUrl();
    const socket = new WebSocket(url);
    let resolved = false;

    socket.on("open", () => {
      console.log("Gateway WebSocket connected, waiting for challenge...");
    });

    socket.on("message", (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Handle auth challenge
      if (msg.event === "connect.challenge") {
        const authReq = {
          type: "req",
          id: crypto.randomUUID(),
          method: "connect",
          params: { token: config.gatewayToken },
        };
        socket.send(JSON.stringify(authReq));
        // Track this as a pending request to handle the auth response
        pending.set(authReq.id, {
          resolve: () => {
            authenticated = true;
            connecting = false;
            ws = socket;
            if (!resolved) {
              resolved = true;
              resolve();
            }
            console.log("Gateway authenticated");
          },
          reject: (err) => {
            connecting = false;
            if (!resolved) {
              resolved = true;
              reject(err);
            }
          },
          timer: setTimeout(() => {
            pending.delete(authReq.id);
            connecting = false;
            if (!resolved) {
              resolved = true;
              reject(new Error("Auth handshake timeout"));
            }
          }, REQUEST_TIMEOUT_MS),
        });
        return;
      }

      // Handle response to a request
      if (msg.id && pending.has(msg.id)) {
        const req = pending.get(msg.id)!;
        pending.delete(msg.id);
        clearTimeout(req.timer);
        if (msg.ok === false) {
          req.reject(new Error(msg.error?.message || "Gateway error"));
        } else {
          req.resolve(msg.payload ?? msg);
        }
        return;
      }
    });

    socket.on("close", () => {
      console.log("Gateway WebSocket closed, reconnecting in 3s...");
      ws = null;
      authenticated = false;
      connecting = false;
      // Reject all pending requests
      for (const [id, req] of pending) {
        clearTimeout(req.timer);
        req.reject(new Error("WebSocket closed"));
        pending.delete(id);
      }
      setTimeout(() => { void connect(); }, RECONNECT_DELAY_MS);
    });

    socket.on("error", (err) => {
      console.error("Gateway WebSocket error:", err.message);
      connecting = false;
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Connection timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        connecting = false;
        socket.terminate();
        reject(new Error("Gateway connection timeout"));
      }
    }, REQUEST_TIMEOUT_MS);
  });
}

async function ensureConnected(): Promise<void> {
  if (ws && authenticated) return;
  await connect();
}

export async function callGateway(method: string, params?: Record<string, unknown>): Promise<unknown> {
  try {
    await ensureConnected();
  } catch (err) {
    throw new Error(`Gateway not available: ${(err as Error).message}`);
  }

  if (!ws || !authenticated) {
    throw new Error("Gateway not connected");
  }

  const id = crypto.randomUUID();
  const message = {
    type: "req",
    id,
    method,
    params: params || {},
  };

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Gateway request timeout: ${method}`));
    }, REQUEST_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    ws!.send(JSON.stringify(message));
  });
}

// Initialize connection on module load
void connect().catch((err) => {
  console.error("Initial gateway connection failed:", err.message);
});
