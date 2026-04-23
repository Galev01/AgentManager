import crypto from "node:crypto";
import * as oidc from "openid-client";
import type { OidcProviderConfig } from "@openclaw-manager/types";

export type AuthRequestInput = {
  issuerUrl: string; clientId: string; redirectUri: string;
  scopes: string[]; authorizationEndpoint: string;
};
export type AuthRequest = { url: string; state: string; nonce: string; codeVerifier: string };

function b64url(b: Buffer): string { return b.toString("base64url"); }
function rnd(): string { return b64url(crypto.randomBytes(32)); }

export function buildAuthRequest(input: AuthRequestInput): AuthRequest {
  const state = rnd();
  const nonce = rnd();
  const codeVerifier = rnd();
  const challenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state, nonce, codeVerifier };
}

export type CallbackParams = { code: string; state: string };
export function parseCallback(fullUrl: string): CallbackParams | null {
  const u = new URL(fullUrl);
  if (u.searchParams.get("error")) return null;
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export type OidcClientContext = { config: oidc.Configuration; provider: OidcProviderConfig };

export async function discoverClient(provider: OidcProviderConfig): Promise<OidcClientContext> {
  const config = await oidc.discovery(new URL(provider.issuerUrl), provider.clientId, provider.clientSecret);
  return { config, provider };
}

export type OidcIdentity = {
  issuer: string; sub: string; email?: string; name?: string; emailVerified?: boolean;
};

export async function exchangeAndClaims(
  ctx: OidcClientContext,
  input: { currentUrl: URL; state: string; nonce: string; codeVerifier: string },
): Promise<OidcIdentity> {
  const tokens = await oidc.authorizationCodeGrant(ctx.config, input.currentUrl, {
    expectedState: input.state, expectedNonce: input.nonce, pkceCodeVerifier: input.codeVerifier,
  });
  const claims = tokens.claims();
  if (!claims || !claims.sub) throw new Error("missing sub");
  return {
    issuer: String(claims.iss ?? ctx.provider.issuerUrl),
    sub: String(claims.sub),
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    emailVerified: typeof claims.email_verified === "boolean" ? claims.email_verified : undefined,
  };
}
