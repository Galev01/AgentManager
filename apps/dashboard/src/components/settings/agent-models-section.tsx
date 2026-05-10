"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgentModelsSnapshot } from "@openclaw-manager/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { ModelSelect } from "@/components/model-select";
import { useToast } from "./use-toast";

interface Props { snapshot: AgentModelsSnapshot }

export function AgentModelsSection({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(snapshot);
  const [rowPending, setRowPending] = useState<string | null>(null);

  useEffect(() => { setLocal(snapshot); }, [snapshot]);

  const catalogIds = useMemo(() => new Set(local.catalog.map((m) => m.id)), [local.catalog]);

  async function patch(agentName: string, modelId: string) {
    setRowPending(agentName);
    try {
      const res = await fetch("/api/agent-models", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentName, modelId }),
      });
      if (!res.ok) {
        const text = await res.text();
        let friendly: string;
        try {
          const body = JSON.parse(text) as { error?: string; detail?: string };
          if (body.error === "invalid_model_id") friendly = body.detail ?? "Model not in current allowed catalog.";
          else if (body.error === "model_catalog_unavailable") friendly = "Model catalog is unavailable; try again later.";
          else friendly = body.detail ?? body.error ?? text;
        } catch {
          friendly = text;
        }
        throw new Error(friendly);
      }
      setLocal((prev) => ({
        ...prev,
        agents: prev.agents.map((a) =>
          a.agentId === agentName ? { ...a, effectiveModelId: modelId } : a,
        ),
      }));
      startTransition(() => router.refresh());
      toast.push("success", `Model updated for ${agentName}.`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setRowPending(null);
    }
  }

  const catalogUnavailable = local.catalogStatus === "unavailable";
  const defaultModelId = local.globalDefaultModelId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Models</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3">
          {catalogUnavailable && (
            <div className="rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
              Model catalog is unavailable from the runtime. Selection is read-only until it returns.
            </div>
          )}
          <div className="text-xs text-neutral-400">
            Catalog source: Agent runtime
            {defaultModelId && <> - Default model: <span className="text-neutral-200">{defaultModelId}</span></>}
          </div>
          <div className="grid gap-2">
            {local.agents.map((a) => {
              const inCatalog = a.effectiveModelId ? catalogIds.has(a.effectiveModelId) : true;
              const disabled = catalogUnavailable || pending || rowPending === a.agentId;
              return (
                <div key={a.agentId} className="flex items-center gap-3 rounded border border-neutral-800 p-3">
                  <div className="flex-1">
                    <div className="font-medium text-neutral-100">{a.agentName ?? a.agentId}</div>
                    <div className="text-xs text-neutral-400">
                      {a.effectiveModelId ?? "(no model set)"}
                      {!inCatalog && a.effectiveModelId && (
                        <span className="ml-2 text-amber-400">model not in current catalog</span>
                      )}
                    </div>
                  </div>
                  <PermissionGate perm="agents.manage">
                    <ModelSelect
                      catalog={local.catalog}
                      status={local.catalogStatus}
                      value={a.effectiveModelId ?? ""}
                      disabled={disabled}
                      placeholder={a.effectiveModelId ? "" : "Select a model"}
                      className="text-neutral-100"
                      style={{ minWidth: 300 }}
                      onChange={(modelId) => patch(a.agentId, modelId)}
                    />
                    <button
                      type="button"
                      className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 disabled:opacity-50"
                      disabled={disabled || !defaultModelId}
                      title={!defaultModelId ? "default model not available from runtime" : undefined}
                      onClick={() => defaultModelId && patch(a.agentId, defaultModelId)}
                    >
                      Set to current default
                    </button>
                  </PermissionGate>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-neutral-500">
            "Set to current default" saves the current default as this agent's model. It does not restore inheritance; future changes to the global default will not follow automatically.
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
