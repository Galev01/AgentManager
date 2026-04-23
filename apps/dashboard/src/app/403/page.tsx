import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Page() {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-2 text-3xl font-semibold text-text-primary">Access denied</h1>
        <p className="mb-6 text-sm text-text-muted">
          {user
            ? `You are signed in as ${user.username}, but you don't have permission to view this page.`
            : "You need to sign in to continue."}
        </p>
        <Link href="/" className="inline-block rounded-pill bg-primary py-3 px-6 font-medium text-white">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
