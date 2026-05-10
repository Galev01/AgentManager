"use client";

import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RuntimeConfigSnapshot, RuntimeDescriptor } from "@openclaw-manager/types";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PermissionGate } from "@/components/permission-gate";
import { RuntimeFallbackBanner } from "@/components/runtime-fallback-banner";
import { useToast } from "./use-toast";

interface Props { snapshot: RuntimeConfigSnapshot }

type RuntimeFormState = {
  id: string;
  kind: RuntimeDescriptor["kind"];
  displayName: string;
  endpoint: string;
  transport: RuntimeDescriptor["transport"];
  authMode: RuntimeDescriptor["authMode"];
  notes: string;
  enabled: boolean;
};

const emptyRuntime: RuntimeFormState = {
  id: "",
  kind: "hermes",
  displayName: "",
  endpoint: "http://192.168.0.10:9119",
  transport: "http",
  authMode: "bearer",
  notes: "",
  enabled: true,
};

export function RuntimesSection({ snapshot }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(snapshot);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeFormState>(emptyRuntime);

  const isEditingExisting = useMemo(
    () => editingId != null && local.runtimes.some((r) => r.id === editingId),
    [editingId, local.runtimes],
  );

  async function patch(body: unknown) {
    try {
      const res = await fetch("/api/runtime-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await friendlyError(res));
      const next: RuntimeConfigSnapshot = await res.json();
      setLocal(next);
      startTransition(() => router.refresh());
      toast.push("success", "Runtime config saved.");
      return next;
    } catch (e) {
      setLocal(snapshot);
      toast.push("error", e instanceof Error ? e.message : "Save failed");
      return null;
    }
  }

  function editRuntime(runtime: RuntimeDescriptor) {
    setEditingId(runtime.id);
    setForm({
      id: runtime.id,
      kind: runtime.kind,
      displayName: runtime.displayName,
      endpoint: runtime.endpoint,
      transport: runtime.transport,
      authMode: runtime.authMode,
      notes: runtime.notes ?? "",
      enabled: runtime.enabled ?? true,
    });
  }

  function startNewRuntime() {
    setEditingId("__new__");
    setForm(emptyRuntime);
  }

  async function saveRuntime() {
    const runtime = formToDescriptor(form);
    if (!runtime) return;
    const next = await patch({ upsertRuntime: runtime });
    if (next) {
      setEditingId(null);
      setForm(emptyRuntime);
    }
  }

  async function removeRuntime(id: string) {
    const next = await patch({ removeRuntimeId: id });
    if (next && editingId === id) {
      setEditingId(null);
      setForm(emptyRuntime);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtimes</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="grid gap-4">
          <RuntimeFallbackBanner
            reason={local.fallbackReason}
            configured={local.configuredPrimaryRuntimeId}
            effective={local.effectivePrimaryRuntimeId}
          />

          <div className="grid gap-2">
            {local.runtimes.map((r) => {
              const isPrimary = local.configuredPrimaryRuntimeId === r.id;
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-100">{r.displayName}</div>
                    <div className="break-all text-xs text-neutral-400">{r.kind} / {r.endpoint}</div>
                    <div className="mt-1 text-xs">
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
                        checked={isPrimary} disabled={pending || !(r.enabled ?? true)}
                        onChange={() => patch({ configuredPrimaryRuntimeId: r.id })} />
                      primary
                    </label>
                    <label className="ml-3 flex items-center gap-1 text-sm text-neutral-300">
                      <input type="checkbox"
                        checked={r.enabled} disabled={pending}
                        onChange={(e) => patch({ enabled: { [r.id]: e.target.checked } })} />
                      enabled
                    </label>
                    <button
                      type="button"
                      className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
                      disabled={pending}
                      onClick={() => editRuntime(r)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-900/70 px-3 py-1 text-sm text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                      disabled={pending || isPrimary || local.runtimes.length <= 1}
                      onClick={() => removeRuntime(r.id)}
                    >
                      Remove
                    </button>
                  </PermissionGate>
                </div>
              );
            })}
          </div>

          <PermissionGate perm="runtimes.config">
            {editingId ? (
              <div className="grid gap-3 rounded border border-neutral-800 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-neutral-100">
                    {isEditingExisting ? "Edit runtime" : "Add runtime"}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-neutral-400 hover:text-neutral-100"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyRuntime);
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="ID">
                    <input className={inputClass} value={form.id} disabled={isEditingExisting}
                      onChange={(e) => setForm({ ...form, id: e.target.value })} />
                  </Field>
                  <Field label="Display name">
                    <input className={inputClass} value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                  </Field>
                  <Field label="Kind">
                    <select className={inputClass} value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value as RuntimeFormState["kind"] })}>
                      <option value="openclaw">OpenClaw</option>
                      <option value="hermes">Hermes</option>
                      <option value="zeroclaw">ZeroClaw</option>
                      <option value="nanobot">Nanobot</option>
                    </select>
                  </Field>
                  <Field label="Endpoint">
                    <input className={inputClass} value={form.endpoint}
                      onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
                  </Field>
                  <Field label="Transport">
                    <select className={inputClass} value={form.transport}
                      onChange={(e) => setForm({ ...form, transport: e.target.value as RuntimeFormState["transport"] })}>
                      <option value="http">HTTP</option>
                      <option value="ws">WebSocket</option>
                      <option value="mcp-stdio">MCP stdio</option>
                      <option value="sdk">SDK</option>
                    </select>
                  </Field>
                  <Field label="Auth mode">
                    <select className={inputClass} value={form.authMode}
                      onChange={(e) => setForm({ ...form, authMode: e.target.value as RuntimeFormState["authMode"] })}>
                      <option value="bearer">Bearer</option>
                      <option value="token-env">Token env</option>
                      <option value="mcp-none">MCP none</option>
                    </select>
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea className={inputClass} rows={2} value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input type="checkbox" checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
                  enabled
                </label>
                <div>
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    disabled={pending}
                    onClick={saveRuntime}
                  >
                    Save runtime
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-fit rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                disabled={pending}
                onClick={startNewRuntime}
              >
                Add runtime
              </button>
            )}
          </PermissionGate>
        </div>
      </CardBody>
    </Card>
  );
}

const inputClass =
  "w-full rounded border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-60";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm text-neutral-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formToDescriptor(form: RuntimeFormState): RuntimeDescriptor | null {
  const id = form.id.trim();
  const displayName = form.displayName.trim();
  const endpoint = form.endpoint.trim();
  if (!id || !displayName || !endpoint) return null;
  return {
    id,
    kind: form.kind,
    displayName,
    endpoint,
    transport: form.transport,
    authMode: form.authMode,
    enabled: form.enabled,
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
}

async function friendlyError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string; detail?: string };
    if (body.error === "cannot_disable_all") return "At least one runtime must remain enabled.";
    if (body.error === "cannot_remove_primary") return "Choose a different primary runtime before removing this one.";
    if (body.error === "unknown_runtime_id") return body.detail ?? "Unknown runtime id.";
    if (body.error === "invalid_runtime_descriptor") return body.detail ?? "Runtime details are invalid.";
  } catch {
    // fall through
  }
  return text;
}
