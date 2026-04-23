import { requirePermission } from "@/lib/auth/current-user";
import { PERMISSION_REGISTRY, PERMISSION_CATEGORIES } from "@openclaw-manager/types";
import { NewForm } from "./new-form";

export default async function Page() {
  await requirePermission("auth.roles.write");
  const categories = PERMISSION_CATEGORIES.map((cat) => ({
    category: cat,
    items: Object.entries(PERMISSION_REGISTRY)
      .filter(([, meta]) => meta.category === cat)
      .map(([pid, meta]) => ({ id: pid, label: meta.label, description: meta.description })),
  }));
  return <NewForm categories={categories} />;
}
