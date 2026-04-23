"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RuntimeSettingsV2 } from "@openclaw-manager/types";
import { msToMinutes, minutesToMs } from "@/lib/format";
import { Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { useToast } from "./use-toast";

interface Props {
  settings: RuntimeSettingsV2;
  onDirtyChange?: (dirty: boolean) => void;
}

export function RuntimeSection({ settings, onDirtyChange }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [relayTarget, setRelayTarget] = useState(settings.relayTarget);
  const [delayMin, setDelayMin] = useState(String(msToMinutes(settings.delayMs)));
  const [summaryDelayMin, setSummaryDelayMin] = useState(
    String(msToMinutes(settings.summaryDelayMs)),
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    relayTarget !== settings.relayTarget ||
    Number(delayMin) !== msToMinutes(settings.delayMs) ||
    Number(summaryDelayMin) !== msToMinutes(settings.summaryDelayMs);

  const lastReportedDirty = useRef(dirty);
  useEffect(() => {
    if (lastReportedDirty.current !== dirty) {
      lastReportedDirty.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [dirty, onDirtyChange]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relayTarget,
          delayMs: minutesToMs(Number(delayMin) || 0),
          summaryDelayMs: minutesToMs(Number(summaryDelayMin) || 0),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.push("success", "Runtime settings saved.");
      router.refresh();
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime</CardTitle>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-faint)" }}>
          Applies to all conversations
        </span>
      </CardHeader>
      <CardBody>
        <div style={{ display: "grid", gap: 14 }}>
          <Field label="Default relay target (phone)" hint="Used when no routing rule matches.">
            <input
              type="text"
              value={relayTarget}
              onChange={(e) => setRelayTarget(e.target.value)}
              placeholder="+972..."
              className="settings-input"
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            <Field label="Cold-start delay (minutes)" hint="Wait before waking a cold conversation.">
              <input
                type="number"
                min={0}
                value={delayMin}
                onChange={(e) => setDelayMin(e.target.value)}
                className="settings-input"
              />
            </Field>
            <Field label="Summary delay (minutes)" hint="Idle time before summary is dispatched.">
              <input
                type="number"
                min={0}
                value={summaryDelayMin}
                onChange={(e) => setSummaryDelayMin(e.target.value)}
                className="settings-input"
              />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PermissionGate perm="settings.write">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </Button>
            </PermissionGate>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{hint}</span>
      )}
    </label>
  );
}
