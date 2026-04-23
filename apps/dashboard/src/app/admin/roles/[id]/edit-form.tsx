"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthRole, PermissionId } from "@openclaw-manager/types";

type Cat = { category: string; items: Array<{ id: string; label: string; description: string }> };

export function EditForm({
  role, categories, canWrite,
}: { role: AuthRole; categories: Cat[]; canWrite: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [grants, setGrants] = useState<Set<PermissionId>>(
    new Set(role.grants.map((g) => g.permissionId)),
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const systemLocked = role.system;
  const grantsDisabled = !canWrite || systemLocked;
  const metaDisabled = !canWrite;

  function toggle(pid: PermissionId): void {
    if (grantsDisabled) return;
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(""); setBusy(true);
    const body: Record<string, unknown> = { name, description };
    if (!systemLocked) body.grants = Array.from(grants);
    const res = await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    router.refresh();
  }

  async function remove(): Promise<void> {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    const res = await fetch(`/api/admin/roles/${encodeURIComponent(role.id)}`, { method: "DELETE" });
    if (!res.ok) { alert((await res.json()).error || "failed"); return; }
    router.push("/admin/roles");
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-text-primary">{role.name}</h2>
        {systemLocked && <span className="rounded bg-dark px-2 py-0.5 text-xs text-text-muted">system</span>}
      </div>
      <label className="block text-sm text-text-muted">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={metaDisabled}
          className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2"
        />
      </label>
      <label className="block text-sm text-text-muted">
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={metaDisabled}
          className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2"
        />
      </label>
      <details open>
        <summary className="cursor-pointer text-sm text-text-muted">
          Permissions (allow-only){systemLocked ? " — read-only for system roles" : ""}
        </summary>
        {categories.map((cat) => (
          <div key={cat.category} className="mt-4">
            <h3 className="text-sm font-semibold capitalize">{cat.category}</h3>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {cat.items.map((it) => (
                  <tr key={it.id} className="border-t border-dark-border">
                    <td className="py-1 pr-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={grants.has(it.id as PermissionId)}
                          onChange={() => toggle(it.id as PermissionId)}
                          disabled={grantsDisabled}
                        />
                        <span>{it.label}</span>
                      </label>
                    </td>
                    <td className="py-1 text-xs text-text-muted">{it.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </details>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || metaDisabled}
          className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
        {canWrite && !systemLocked && (
          <button
            type="button"
            onClick={remove}
            className="rounded-pill border border-danger py-2 px-4 text-danger"
          >
            Delete role
          </button>
        )}
      </div>
    </form>
  );
}
