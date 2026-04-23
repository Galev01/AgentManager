"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RelayRecipient } from "@openclaw-manager/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
} from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { useToast } from "./use-toast";

interface Props {
  recipients: RelayRecipient[];
  defaultRelayTarget: string;
}

export function RecipientsSection({ recipients, defaultRelayTarget }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!phone.trim() || !label.trim()) {
      toast.push("error", "Phone and label are required.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), label: label.trim(), enabled: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPhone("");
      setLabel("");
      toast.push("success", "Recipient added.");
      router.refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setPendingId(id);
    try {
      const res = await fetch("/api/relay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(id: string, label: string) {
    if (!confirm(`Remove recipient "${label}"?`)) return;
    setPendingId(id);
    try {
      const res = await fetch("/api/relay", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.push("success", "Recipient removed.");
      router.refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Remove failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relay recipients</CardTitle>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-faint)" }}>
          {recipients.length} configured
        </span>
      </CardHeader>
      <CardBody>
        <PermissionGate perm="relay.manage">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: 14 }}>
            <input
              className="settings-input"
              placeholder="Phone (+972...)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="settings-input"
              placeholder="Label (e.g. On-call)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button variant="primary" onClick={handleAdd} disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        </PermissionGate>
        {recipients.length === 0 ? (
          <EmptyState
            title="No recipients"
            description="Add a recipient to enable rule-based relay. Until then, the default target is used."
          />
        ) : (
          <DataTable
            rowKey={(r) => r.id}
            rows={recipients}
            columns={[
              {
                key: "label",
                header: "Label",
                render: (r) => (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {r.label}
                    {r.phone === defaultRelayTarget && <Badge kind="acc">default</Badge>}
                  </span>
                ),
              },
              { key: "phone", header: "Phone", render: (r) => <span className="mono">{r.phone}</span> },
              {
                key: "enabled",
                header: "Enabled",
                width: "110px",
                render: (r) => (
                  <PermissionGate perm="relay.manage" fallback={<span style={{ color: "var(--text-faint)" }}>{r.enabled ? "on" : "off"}</span>}>
                    <Button
                      variant="ghost"
                      className="btn-sm"
                      onClick={() => handleToggle(r.id, !r.enabled)}
                      disabled={pendingId === r.id}
                    >
                      <span className={`sw ${r.enabled ? "on" : ""}`} style={{ marginRight: 6 }} />
                      {r.enabled ? "on" : "off"}
                    </Button>
                  </PermissionGate>
                ),
              },
              {
                key: "actions",
                header: "",
                width: "70px",
                render: (r) => (
                  <PermissionGate perm="relay.manage" fallback={<span style={{ color: "var(--text-faint)" }}>—</span>}>
                    <Button
                      variant="danger"
                      className="btn-sm"
                      onClick={() => handleRemove(r.id, r.label)}
                      disabled={pendingId === r.id}
                    >
                      Remove
                    </Button>
                  </PermissionGate>
                ),
              },
            ]}
          />
        )}
      </CardBody>
    </Card>
  );
}
