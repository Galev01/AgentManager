"use client";

import { useEffect, useState } from "react";
import type { RelayRecipient, RuntimeSettingsV2 } from "@openclaw-manager/types";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  StatusLamp,
  type LampStatus,
} from "@/components/ui";

interface Props {
  settings: RuntimeSettingsV2;
  recipients: RelayRecipient[];
}

export function HealthSection({ settings, recipients }: Props) {
  const [gatewayStatus, setGatewayStatus] = useState<LampStatus>("warn");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/gateway-status", { cache: "no-store" });
        if (!res.ok) throw new Error("unreachable");
        const data = await res.json();
        if (!cancelled) setGatewayStatus(data?.status === "online" ? "ok" : "err");
      } catch {
        if (!cancelled) setGatewayStatus("err");
      }
    }
    load();
    const t = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const targetLamp: LampStatus = settings.relayTarget ? "ok" : "warn";
  const enabledCount = recipients.filter((r) => r.enabled).length;
  const recipientLamp: LampStatus =
    enabledCount > 0 ? "ok" : recipients.length > 0 ? "warn" : "off";

  const items: Array<{ label: string; status: LampStatus; detail: string }> = [
    { label: "Gateway", status: gatewayStatus, detail: gatewayStatus === "ok" ? "online" : "offline or unreachable" },
    { label: "Default relay target", status: targetLamp, detail: settings.relayTarget || "not configured" },
    {
      label: "Recipients",
      status: recipientLamp,
      detail:
        recipients.length === 0
          ? "none configured"
          : `${enabledCount}/${recipients.length} enabled`,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>System health</CardTitle>
      </CardHeader>
      <CardBody>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {items.map((it) => (
            <div
              key={it.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--bg-elev)",
              }}
            >
              <StatusLamp status={it.status} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{it.label}</div>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={it.detail}
                >
                  {it.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
