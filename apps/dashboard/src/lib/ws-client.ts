"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "@openclaw-manager/types";

type WsStatus = "connecting" | "connected" | "disconnected";

/**
 * Connects to the dashboard SSE endpoint at /api/events which proxies
 * bridge WebSocket events server-side. The bridge token never reaches
 * the browser — auth is via the session cookie.
 */
export function useBridgeEvents(onMessage: (msg: WsMessage) => void) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const sourceRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (sourceRef.current) return;
    setStatus("connecting");

    const source = new EventSource("/api/events");
    sourceRef.current = source;

    source.onopen = () => setStatus("connected");

    source.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "connected") {
          setStatus("connected");
        }
        onMessageRef.current(msg);
      } catch {
        // ignore malformed
      }
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setStatus("disconnected");
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [connect]);

  return { status };
}
