import { requireAuth } from "@/lib/auth/current-user";
import { LinkForm } from "./link-form";

export default async function Page() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-4 text-2xl font-semibold text-text-primary">Link external identity</h1>
      <LinkForm />
    </div>
  );
}
