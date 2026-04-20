"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Channel } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  KV,
  PageHeader,
  StatCard,
  StatusLamp,
  type BadgeKind,
  type LampStatus,
} from "./ui";

const STATUS_KIND: Record<Channel["status"], BadgeKind> = {
  connected: "ok",
  disconnected: "mute",
  error: "err",
};

const STATUS_LAMP: Record<Channel["status"], LampStatus> = {
  connected: "ok",
  disconnected: "off",
  error: "err",
};

const STATUS_LABEL: Record<Channel["status"], string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

function extractError(info?: Record<string, unknown>): string | null {
  if (!info) return null;
  const err = info.error ?? info.lastError ?? info.reason;
  return typeof err === "string" && err.length > 0 ? err : null;
}

export function ChannelCards({ initial }: { initial: Channel[] }) {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>(initial);
  const [loggingOut, setLoggingOut] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = {
    connected: channels.filter((c) => c.status === "connected").length,
    disconnected: channels.filter((c) => c.status === "disconnected").length,
    error: channels.filter((c) => c.status === "error").length,
  };

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/channels");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to refresh channels");
      }
      setChannels(await res.json());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleLogout(name: string) {
    if (!confirm(`Logout channel "${name}"? This will disconnect the channel.`)) return;
    setLoggingOut(name);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "logout" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to logout channel");
      }
      const refreshRes = await fetch("/api/channels");
      if (refreshRes.ok) setChannels(await refreshRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoggingOut(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Channels"
        sub={`${channels.length} total · ${count.connected} connected${count.error ? ` · ${count.error} error` : ""}`}
        actions={
          <Button variant="ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid oklch(0.68 0.20 25 / 0.4)",
            background: "var(--err-dim)",
            color: "var(--err)",
            fontSize: 12.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{error}</span>
          <Button variant="ghost" className="btn-sm" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="hero-4" style={{ marginBottom: "var(--row-gap)" }}>
        <StatCard
          label="Connected"
          value={count.connected}
          sub={count.connected > 0 ? "live" : "—"}
          accent={count.connected > 0 ? "var(--ok)" : undefined}
        />
        <StatCard
          label="Disconnected"
          value={count.disconnected}
          sub={count.disconnected > 0 ? "offline" : "—"}
        />
        <StatCard
          label="Error"
          value={count.error}
          sub={count.error > 0 ? "needs attention" : "—"}
          accent={count.error > 0 ? "var(--err)" : undefined}
        />
        <StatCard label="Total" value={channels.length} sub="configured" />
      </div>

      {channels.length === 0 ? (
        <Card>
          <EmptyState
            title="No channels configured"
            description="Channels are defined in the bridge config. Add one there and refresh."
          />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "var(--row-gap)",
          }}
        >
          {channels.map((ch) => {
            const errMsg = ch.status === "error" ? extractError(ch.accountInfo) : null;
            const kvItems = ch.accountInfo
              ? Object.entries(ch.accountInfo)
                  .filter(([k]) => k !== "error" && k !== "lastError" && k !== "reason")
                  .map(([k, v]) => ({ label: k, value: String(v) }))
              : [];

            return (
              <Card
                key={ch.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: 16,
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <StatusLamp status={STATUS_LAMP[ch.status]} />
                      <span
                        className="pri"
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ch.name}
                      </span>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {ch.type}
                    </div>
                  </div>
                  <Badge kind={STATUS_KIND[ch.status]}>{STATUS_LABEL[ch.status]}</Badge>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>Last activity</span>
                  <span className="mono" title={ch.lastActivityAt ? new Date(ch.lastActivityAt).toLocaleString() : ""}>
                    {ch.lastActivityAt ? timeAgo(ch.lastActivityAt) : "—"}
                  </span>
                </div>

                {errMsg && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius)",
                      border: "1px solid oklch(0.68 0.20 25 / 0.4)",
                      background: "var(--err-dim)",
                      color: "var(--err)",
                      fontSize: 11.5,
                      lineHeight: 1.4,
                    }}
                  >
                    {errMsg}
                  </div>
                )}

                {kvItems.length > 0 && <KV items={kvItems} />}

                <div style={{ marginTop: "auto", paddingTop: 4 }}>
                  <Button
                    variant="danger"
                    className="btn-sm"
                    onClick={() => handleLogout(ch.name)}
                    disabled={loggingOut === ch.name || ch.status === "disconnected"}
                    style={{ width: "100%" }}
                  >
                    {loggingOut === ch.name ? "Logging out…" : "Logout"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
