import { AppShell } from "@/components/app-shell";
import { CapabilitiesView } from "@/components/capabilities-view";
import { requirePermission } from "@/lib/auth/current-user";

export default async function CapabilitiesPage() {
  await requirePermission("capabilities.view");
  return (
    <AppShell title="Capabilities">
      <CapabilitiesView />
    </AppShell>
  );
}
