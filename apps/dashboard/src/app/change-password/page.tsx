import { requireAuth } from "@/lib/auth/current-user";
import { ChangeForm } from "./change-form";

export default async function Page() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Change password</h1>
      <ChangeForm />
    </div>
  );
}
