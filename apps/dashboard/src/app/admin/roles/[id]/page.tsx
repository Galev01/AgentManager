import { requirePermission } from "@/lib/auth/current-user";
import { bridgeListRoles } from "@/lib/auth/bridge-auth-client";
import { PERMISSION_REGISTRY, PERMISSION_CATEGORIES } from "@openclaw-manager/types";
import { notFound } from "next/navigation";
import { EditForm } from "./edit-form";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await requirePermission("auth.roles.read");
  const roles = await bridgeListRoles(s.user.id, s.sid, s.user.username);
  const role = roles.find((r) => r.id === id);
  if (!role) notFound();
  const categories = PERMISSION_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(PERMISSION_REGISTRY)
      .filter(([, meta]) => meta.category === cat)
      .map(([pid, meta]) => ({ id: pid, label: meta.label, description: meta.description })),
  }));
  return (
    <EditForm
      role={role}
      categories={categories}
      canWrite={s.permissions.includes("auth.roles.write")}
    />
  );
}
