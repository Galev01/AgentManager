"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUserPublic, AuthRole, AuthGrant, PermissionId } from "@openclaw-manager/types";

type Cat = { category: string; items: Array<{ id: string; label: string; description: string }> };

function grantKind(grants: AuthGrant[], pid: PermissionId): "inherit" | "allow" | "deny" {
  const g = grants.find((x) => x.permissionId === pid);
  if (!g) return "inherit";
  return g.kind;
}

export function EditForm({
  user,
  roles,
  categories,
  canWrite,
}: {
  user: AuthUserPublic;
  roles: AuthRole[];
  categories: Cat[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState({
    displayName: user.displayName ?? "",
    email: user.email ?? "",
    status: user.status,
    roleIds: [...user.roleIds],
    grants: [...user.grants] as AuthGrant[],
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetPw, setResetPw] = useState("");

  function setGrant(pid: PermissionId, kind: "inherit" | "allow" | "deny"): void {
    setState((p) => {
      const next = p.grants.filter((g) => g.permissionId !== pid);
      if (kind !== "inherit") next.push({ permissionId: pid, kind });
      return { ...p, grants: next };
    });
  }

  async function save(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: state.displayName,
        email: state.email,
        status: state.status,
        roleIds: state.roleIds,
        grants: state.grants,
      }),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "failed"); return; }
    router.refresh();
  }

  async function resetPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPw }),
    });
    if (res.ok) {
      setResetPw("");
      alert("Password reset. All sessions revoked.");
    } else {
      alert((await res.json()).error || "failed");
    }
  }

  async function unlink(providerKey: string, issuer: string, sub: string): Promise<void> {
    if (!confirm("Unlink this identity?")) return;
    await fetch(
      `/api/admin/users/${user.id}/links/${encodeURIComponent(providerKey)}/${encodeURIComponent(issuer)}/${encodeURIComponent(sub)}`,
      { method: "DELETE" },
    );
    router.refresh();
  }

  const disabled = !canWrite;

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">{user.username}</h2>
        <label className="block text-sm text-text-muted">
          Display name
          <input
            value={state.displayName}
            onChange={(e) => setState({ ...state, displayName: e.target.value })}
            disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2"
          />
        </label>
        <label className="block text-sm text-text-muted">
          Email
          <input
            type="email"
            value={state.email}
            onChange={(e) => setState({ ...state, email: e.target.value })}
            disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2"
          />
        </label>
        <label className="block text-sm text-text-muted">
          Status
          <select
            value={state.status}
            onChange={(e) => setState({ ...state, status: e.target.value as "active" | "disabled" })}
            disabled={disabled}
            className="mt-1 block w-full rounded border border-dark-border bg-dark px-4 py-2"
          >
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </label>
        <fieldset>
          <legend className="text-sm text-text-muted">Roles</legend>
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.roleIds.includes(r.id)}
                disabled={disabled}
                onChange={(e) =>
                  setState({
                    ...state,
                    roleIds: e.target.checked
                      ? [...state.roleIds, r.id]
                      : state.roleIds.filter((x) => x !== r.id),
                  })
                }
              />
              {r.name} {r.system ? <span className="text-xs text-text-muted">(system)</span> : null}
            </label>
          ))}
        </fieldset>
        <details>
          <summary className="cursor-pointer text-sm text-text-muted">Direct permissions (override roles)</summary>
          {categories.map((cat) => (
            <div key={cat.category} className="mt-4">
              <h3 className="text-sm font-semibold capitalize">{cat.category}</h3>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {cat.items.map((it) => {
                    const k = grantKind(state.grants, it.id as PermissionId);
                    return (
                      <tr key={it.id} className="border-t border-dark-border">
                        <td className="py-1 pr-2">{it.label}</td>
                        <td className="py-1 text-xs text-text-muted">{it.description}</td>
                        <td className="py-1">
                          {(["inherit", "allow", "deny"] as const).map((opt) => (
                            <label key={opt} className="ml-2 text-xs">
                              <input
                                type="radio"
                                name={`g-${it.id}`}
                                checked={k === opt}
                                onChange={() => setGrant(it.id as PermissionId, opt)}
                                disabled={disabled}
                              />{" "}
                              {opt}
                            </label>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </details>
        {err && <p className="text-sm text-danger">{err}</p>}
        <button
          type="submit"
          disabled={busy || disabled}
          className="rounded-pill bg-primary py-2 px-4 text-white disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </form>

      {canWrite && (
        <form onSubmit={resetPassword} className="space-y-2 rounded border border-dark-border p-4">
          <h3 className="text-sm font-semibold">Reset password</h3>
          <p className="text-xs text-text-muted">Resetting revokes all active sessions for this user.</p>
          <input
            type="password"
            minLength={8}
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="new password"
            className="block w-full rounded border border-dark-border bg-dark px-4 py-2"
          />
          <button className="rounded-pill bg-warn py-1 px-3 text-xs text-dark">Reset</button>
        </form>
      )}

      <section>
        <h3 className="text-sm font-semibold">Linked identities</h3>
        {user.linkedIdentities.length === 0 ? (
          <p className="text-xs text-text-muted">None.</p>
        ) : (
          <ul className="space-y-1">
            {user.linkedIdentities.map((id) => (
              <li
                key={`${id.providerKey}:${id.issuer}:${id.sub}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="mono">
                  {id.providerKey} · {id.issuer} · {id.sub}
                </span>
                {canWrite && (
                  <button
                    onClick={() => unlink(id.providerKey, id.issuer, id.sub)}
                    className="text-danger text-xs"
                  >
                    Unlink
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
