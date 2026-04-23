"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoutingRule, RelayRecipient } from "@openclaw-manager/types";
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
  rules: RoutingRule[];
  recipients: RelayRecipient[];
}

export function RoutingSection({ rules, recipients }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function recipientLabel(id: string): string {
    const r = recipients.find((rr) => rr.id === id);
    return r ? (r.label || r.phone) : id;
  }

  async function handleToggleSuppress(rule: RoutingRule) {
    setPendingId(rule.id);
    try {
      const res = await fetch("/api/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rule, suppressBot: !rule.suppressBot }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Update failed");
    } finally {
      setPendingId(null);
    }
  }

  const displayRules = rules.slice(0, 8);
  const overflow = rules.length - displayRules.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Routing rules</CardTitle>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-faint)" }}>
          {rules.length} rule{rules.length === 1 ? "" : "s"}
          {overflow > 0 ? ` · showing top ${displayRules.length}` : ""}
        </span>
      </CardHeader>
      <CardBody>
        {rules.length === 0 ? (
          <EmptyState
            title="No routing rules"
            description="Define per-conversation overrides in the full routing editor."
            action={
              <Link href="/routing">
                <Button variant="primary">Open routing editor</Button>
              </Link>
            }
          />
        ) : (
          <>
            <DataTable
              rowKey={(r) => r.id}
              rows={displayRules}
              columns={[
                {
                  key: "target",
                  header: "Target",
                  render: (r) => (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="pri" style={{ fontSize: 13 }}>
                        {r.displayName || r.phone}
                      </span>
                      {r.isDefault && <Badge kind="acc">default</Badge>}
                    </div>
                  ),
                },
                {
                  key: "recipients",
                  header: "Relays to",
                  render: (r) =>
                    r.relayRecipientIds.length === 0 ? (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    ) : (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {r.relayRecipientIds.slice(0, 3).map((id) => (
                          <Badge key={id} kind="mute">
                            {recipientLabel(id)}
                          </Badge>
                        ))}
                        {r.relayRecipientIds.length > 3 && (
                          <Badge kind="mute">+{r.relayRecipientIds.length - 3}</Badge>
                        )}
                      </div>
                    ),
                },
                {
                  key: "suppressBot",
                  header: "Suppress bot",
                  width: "130px",
                  render: (r) => (
                    <PermissionGate perm="routing.manage" fallback={<span style={{ color: "var(--text-faint)" }}>{r.suppressBot ? "on" : "off"}</span>}>
                      <Button
                        variant="ghost"
                        className="btn-sm"
                        onClick={() => handleToggleSuppress(r)}
                        disabled={pendingId === r.id}
                      >
                        <span className={`sw ${r.suppressBot ? "on" : ""}`} style={{ marginRight: 6 }} />
                        {r.suppressBot ? "on" : "off"}
                      </Button>
                    </PermissionGate>
                  ),
                },
                {
                  key: "note",
                  header: "Note",
                  render: (r) => (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {r.note || "—"}
                    </span>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <Link href="/routing">
                <Button variant="secondary">Open full routing editor →</Button>
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
