import Link from "next/link";
import { getEffectivePermissions } from "@/lib/auth/current-user";

const SECTIONS = [
  { perm: "auth.users.read",     href: "/admin/users",     label: "Users",     blurb: "Create, disable, assign roles, reset passwords." },
  { perm: "auth.roles.read",     href: "/admin/roles",     label: "Roles",     blurb: "Define reusable permission bundles." },
  { perm: "auth.providers.read", href: "/admin/auth",      label: "Providers", blurb: "View OIDC configuration." },
  { perm: "auth.audit.read",     href: "/admin/audit",     label: "Audit",     blurb: "Login, password, role, and OIDC events." },
] as const;

export default async function Page() {
  const perms = new Set(await getEffectivePermissions());
  const visible = SECTIONS.filter((s) => perms.has(s.perm));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="rounded border border-dark-border bg-dark-card p-4 transition hover:border-primary"
        >
          <div className="mb-1 text-sm font-semibold text-text-primary">{s.label}</div>
          <div className="text-xs text-text-muted">{s.blurb}</div>
        </Link>
      ))}
    </div>
  );
}
