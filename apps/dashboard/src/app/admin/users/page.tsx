import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListUsers } from "@/lib/auth/bridge-auth-client";
import { PermissionGate } from "@/components/permission-gate";

export default async function Page() {
  const s = await requirePermission("auth.users.read");
  const users = await bridgeListUsers(s.user.id, s.sid, s.user.username);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Users</h2>
        <PermissionGate perm="auth.users.write">
          <Link href="/admin/users/new" className="rounded-pill bg-primary py-2 px-4 text-sm text-white">
            New user
          </Link>
        </PermissionGate>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-sm text-text-muted">
            <th className="py-2">Username</th>
            <th>Display</th>
            <th>Email</th>
            <th>Status</th>
            <th>Roles</th>
            <th>Last login</th>
            <th>Local</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-dark-border text-sm">
              <td className="py-2 mono">{u.username}</td>
              <td>{u.displayName || ""}</td>
              <td>{u.email || ""}</td>
              <td>{u.status}</td>
              <td>{u.roleIds.join(", ")}</td>
              <td className="mono">{u.lastLoginAt?.slice(0, 16) ?? "—"}</td>
              <td>{u.hasLocalPassword ? "✓" : "—"}</td>
              <td>
                <Link href={`/admin/users/${u.id}`} className="text-primary">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
