import { BootstrapForm } from "./bootstrap-form";

export default function BootstrapPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-md">
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <h1 className="mb-2 text-center text-2xl font-semibold text-text-primary">First-run setup</h1>
          <p className="mb-6 text-center text-sm text-text-muted">
            Create the first admin user. You need the bootstrap token set in{" "}
            <code className="rounded bg-dark px-1">AUTH_BOOTSTRAP_TOKEN</code>.
          </p>
          <BootstrapForm />
        </div>
      </div>
    </div>
  );
}
