import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { NewForm } from "./new-form";

export default async function Page() {
  const s = await requirePermission("auth.users.write");
  const roles = await bridgeListRoles(s.user.id, s.sid, s.user.username);
  return <NewForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} />;
}
