import { requirePermission } from "@/lib/auth/current-user";
import { bridgeGetProviders } from "@/lib/auth/bridge-auth-client";

type OidcSummary = {
  key: string;
  displayName: string;
  issuerUrl: string;
  redirectUri: string;
  scopes: string[];
  autoProvision: boolean;
};

export default async function Page() {
  const s = await requirePermission("auth.providers.read");
  const { oidc } = (await bridgeGetProviders(s.user.id, s.sid, s.user.username)) as { oidc: OidcSummary | null };
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-text-primary">Auth providers</h2>
      {oidc ? (
        <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
          <dt className="text-text-muted">Provider key</dt>
          <dd className="mono">{oidc.key}</dd>
          <dt className="text-text-muted">Display name</dt>
          <dd>{oidc.displayName}</dd>
          <dt className="text-text-muted">Issuer</dt>
          <dd className="mono break-all">{oidc.issuerUrl}</dd>
          <dt className="text-text-muted">Redirect URI</dt>
          <dd className="mono break-all">{oidc.redirectUri}</dd>
          <dt className="text-text-muted">Scopes</dt>
          <dd className="mono">{oidc.scopes.join(" ")}</dd>
          <dt className="text-text-muted">Auto-provision</dt>
          <dd>{oidc.autoProvision ? "on" : "off"}</dd>
        </dl>
      ) : (
        <p className="text-sm text-text-muted">
          OIDC is not configured. Set <code>AUTH_OIDC_*</code> env vars and restart the bridge.
        </p>
      )}
    </div>
  );
}
