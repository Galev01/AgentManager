import { bridgeOidcConfig } from "@/lib/auth/bridge-auth-client";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: {
  searchParams: Promise<{ redirect?: string; oidc_unlinked?: string; issuer?: string; sub?: string; email?: string }>;
}) {
  const sp = await props.searchParams;
  let oidc: { enabled: boolean; displayName?: string } = { enabled: false };
  try { oidc = await bridgeOidcConfig(); } catch {}
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark">
      <div className="w-full max-w-sm">
        <div className="h-1 rounded-t bg-gradient-to-r from-primary to-[#AA6CC0]" />
        <div className="rounded-b bg-dark-card p-8 shadow-card-dark">
          <img src="/ManageClaw-TB-DarkMode.png" alt="ManageClaw" className="mx-auto mb-4 h-16 w-auto" />
          <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight text-text-primary">OpenClaw Manager</h1>
          <p className="mb-6 text-center text-sm text-text-muted">Sign in</p>
          <LoginForm
            oidcEnabled={oidc.enabled}
            oidcDisplayName={oidc.displayName}
            redirect={sp.redirect}
            oidcUnlinked={sp.oidc_unlinked === "1"}
            unlinkedIssuer={sp.issuer}
            unlinkedSub={sp.sub}
            unlinkedEmail={sp.email}
          />
        </div>
      </div>
    </div>
  );
}
