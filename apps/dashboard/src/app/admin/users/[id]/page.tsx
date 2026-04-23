import { requirePermission } from "@/lib/auth/current-user";
import { bridgeGetUser, bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { PERMISSION_REGISTRY, PERMISSION_CATEGORIES } from "@openclaw-manager/types";
import { EditForm } from "./edit-form";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await requirePermission("auth.users.read");
  const [user, roles] = await Promise.all([
    bridgeGetUser(s.user.id, s.sid, s.user.username, id),
    bridgeListRoles(s.user.id, s.sid, s.user.username),
  ]);
  const categories = PERMISSION_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(PERMISSION_REGISTRY)
      .filter(([, meta]) => meta.category === cat)
      .map(([pid, meta]) => ({ id: pid, label: meta.label, description: meta.description })),
  }));
  return (
    <EditForm
      user={user}
      roles={roles}
      categories={categories}
      canWrite={s.permissions.includes("auth.users.write")}
    />
  );
}
