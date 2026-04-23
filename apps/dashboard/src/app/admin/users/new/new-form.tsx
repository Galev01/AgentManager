"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewForm({ roles }: { roles: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [v, setV] = useState({ username: "", displayName: "", email: "", password: "", roleIds: [] as string[] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    const { user } = await res.json();
    router.push(`/admin/users/${user.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-lg">
      <input
        required
        placeholder="username"
        value={v.username}
        onChange={(e) => setV({ ...v, username: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <input
        placeholder="display name"
        value={v.displayName}
        onChange={(e) => setV({ ...v, displayName: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <input
        type="email"
        placeholder="email (optional)"
        value={v.email}
        onChange={(e) => setV({ ...v, email: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <input
        type="password"
        minLength={8}
        placeholder="password (blank = OIDC-only)"
        value={v.password}
        onChange={(e) => setV({ ...v, password: e.target.value })}
        className="block w-full rounded border border-dark-border bg-dark px-5 py-3"
      />
      <fieldset className="space-y-1">
        <legend className="text-sm text-text-muted">Roles</legend>
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.roleIds.includes(r.id)}
              onChange={(e) =>
                setV({
                  ...v,
                  roleIds: e.target.checked
                    ? [...v.roleIds, r.id]
                    : v.roleIds.filter((x) => x !== r.id),
                })
              }
            />
            {r.name}
          </label>
        ))}
      </fieldset>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button type="submit" disabled={busy} className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50">
        {busy ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
