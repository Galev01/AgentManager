export type OidcProviderConfig = {
  key: string;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  autoProvision: boolean;
};

export type OidcPublicConfig = { enabled: boolean; displayName?: string };

export type OidcStartResponse = { authorizationUrl: string; state: string };

export type OidcCallbackResult =
  | { kind: "logged_in"; sessionId: string; expiresAt: string }
  | { kind: "unlinked"; issuer: string; sub: string; email?: string }
  | { kind: "error"; code: string; message: string };
