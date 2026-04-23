import { getEffectivePermissions } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";

const ANY = ["auth.users.read", "auth.roles.read", "auth.providers.read", "auth.audit.read"] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perms = await getEffectivePermissions();
  if (!ANY.some((p) => perms.includes(p))) redirect("/403");
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Administration</h1>
      {children}
    </div>
  );
}
