"use client";

import Link from "next/link";
import type { Channel } from "@openclaw-manager/types";
import { timeAgo } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusLamp,
  type BadgeKind,
  type LampStatus,
} from "@/components/ui";

const KIND: Record<Channel["status"], BadgeKind> = {
  connected: "ok",
  disconnected: "mute",
  error: "err",
};
const LAMP: Record<Channel["status"], LampStatus> = {
  connected: "ok",
  disconnected: "off",
  error: "err",
};

interface Props {
  channels: Channel[];
}

export function ChannelsSection({ channels }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Channels</CardTitle>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-faint)" }}>
          {channels.length} · {channels.filter((c) => c.status === "connected").length} connected
        </span>
      </CardHeader>
      <CardBody>
        {channels.length === 0 ? (
          <EmptyState
            title="No channels"
            description="Channels are defined in the bridge config."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {channels.map((ch) => (
              <div
                key={ch.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--bg-elev)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusLamp status={LAMP[ch.status]} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</span>
                  <Badge kind={KIND[ch.status]} className="ml-auto">
                    {ch.status}
                  </Badge>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  {ch.type}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {ch.lastActivityAt ? `Active ${timeAgo(ch.lastActivityAt)}` : "No activity"}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, textAlign: "right" }}>
          <Link href="/channels">
            <Button variant="secondary">Manage channels →</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
