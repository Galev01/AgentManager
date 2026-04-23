import { AppShell } from "@/components/app-shell";
import { CommandRunner } from "@/components/command-runner";
import { requirePermission } from "@/lib/auth/current-user";

export default async function CommandsPage() {
  await requirePermission("commands.run");
  return (
    <AppShell title="Commands">
      <CommandRunner />
    </AppShell>
  );
}
