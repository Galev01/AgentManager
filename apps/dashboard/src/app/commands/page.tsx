import { AppShell } from "@/components/app-shell";
import { CommandRunner } from "@/components/command-runner";

export default function CommandsPage() {
  return (
    <AppShell title="Management Commands">
      <CommandRunner />
    </AppShell>
  );
}
