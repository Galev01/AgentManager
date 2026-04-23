"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PermissionId } from "@openclaw-manager/types";

type Cat = { category: string; items: Array<{ id: string; label: string; description: string }> };

export function NewForm({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [grants, setGrants] = useState<Set<PermissionId>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(pid: PermissionId): void {
    setGrants((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, grants: Array.from(grants) }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    const { role } = await res.json();
    router.push(`/admin/roles/${encodeURIComponent(role.id)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-3xl">
      <input
        required
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <input
        placeholder="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <details open>
        <summary className="cursor-pointer text-sm text-text-muted">Permissions (allow-only)</summary>
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
      <button type="submit" disabled={busy || !name} className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50">
        {busy ? "Creating..." : "Create role"}
      </button>
    </form>
  );
}
