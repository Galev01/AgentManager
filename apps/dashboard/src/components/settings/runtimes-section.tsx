"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeConfigSnapshot } from "@openclaw-manager/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { RuntimeFallbackBanner } from "@/components/runtime-fallback-banner";
import { useToast } from "./use-toast";

interface Props { snapshot: RuntimeConfigSnapshot }

export function RuntimesSection({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(snapshot);

  async function patch(body: unknown) {
    try {
      const res = await fetch("/api/runtime-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let friendly: string;
        try {
          const body = JSON.parse(text) as { error?: string; detail?: string };
          if (body.error === "cannot_disable_all") {
            friendly = "At least one runtime must remain enabled.";
          } else if (body.error === "unknown_runtime_id") {
            friendly = body.detail ? `Unknown runtime id: ${body.detail}` : "Unknown runtime id.";
          } else {
            friendly = text;
          }
        } catch {
          friendly = text;
        }
        throw new Error(friendly);
      }
      const next: RuntimeConfigSnapshot = await res.json();
      setLocal(next);
      startTransition(() => router.refresh());
      toast.push("success", "Runtime config saved.");
    } catch (e) {
      setLocal(snapshot); // rollback
      toast.push("error", e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtimes</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3">
          <RuntimeFallbackBanner
            reason={local.fallbackReason}
            configured={local.configuredPrimaryRuntimeId}
            effective={local.effectivePrimaryRuntimeId}
          />
          <div className="grid gap-2">
            {local.runtimes.map((r) => {
              const isPrimary = local.configuredPrimaryRuntimeId === r.id;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded border border-neutral-800 p-3">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-100">{r.displayName}</div>
                    <div className="text-xs text-neutral-400">{r.kind} · {r.endpoint}</div>
                    <div className="text-xs mt-1">
                      Status: <span className={
                        r.status.state === "healthy" ? "text-emerald-400" :
                        r.status.state === "unhealthy" ? "text-red-400" :
                        "text-neutral-500"
                      }>{r.status.state}</span>
                    </div>
                  </div>
                  <PermissionGate perm="runtimes.config">
                    <label className="flex items-center gap-1 text-sm text-neutral-300">
                      <input type="radio" name="primary"
                        checked={isPrimary} disabled={pending}
                        onChange={() => patch({ configuredPrimaryRuntimeId: r.id })} />
                      primary
                    </label>
                    <label className="flex items-center gap-1 text-sm text-neutral-300 ml-3">
                      <input type="checkbox"
                        checked={r.enabled} disabled={pending}
                        onChange={(e) => patch({ enabled: { [r.id]: e.target.checked } })} />
                      enabled
                    </label>
                  </PermissionGate>
                </div>
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
