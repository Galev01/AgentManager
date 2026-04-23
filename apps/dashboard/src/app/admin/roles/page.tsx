import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { PermissionGate } from "@/components/permission-gate";

export default async function Page() {
  const s = await requirePermission("auth.roles.read");
  const roles = await bridgeListRoles(s.user.id, s.sid, s.user.username);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Roles</h2>
        <PermissionGate perm="auth.roles.write">
          <Link href="/admin/roles/new" className="rounded-pill bg-primary py-2 px-4 text-sm text-white">
            New role
          </Link>
        </PermissionGate>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-text-muted">
            <th className="py-2">Name</th>
            <th>Description</th>
            <th>Grants</th>
            <th>System</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.id} className="border-t border-dark-border text-sm">
              <td className="py-2 mono">{r.name}</td>
              <td>{r.description || ""}</td>
              <td className="mono text-xs">{r.grants.length}</td>
              <td>{r.system ? "✓" : "—"}</td>
              <td>
                <Link href={`/admin/roles/${encodeURIComponent(r.id)}`} className="text-primary">
                  {r.system ? "View" : "Edit"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
