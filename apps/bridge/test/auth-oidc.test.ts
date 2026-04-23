import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthRequest, parseCallback } from "../src/services/auth/oidc.js";

test("buildAuthRequest produces URL with state/nonce/PKCE", () => {
  const req = buildAuthRequest({
    issuerUrl: "https://iss", clientId: "cid",
    redirectUri: "https://dash/cb", scopes: ["openid","email"],
    authorizationEndpoint: "https://iss/authorize",
  });
  assert.ok(req.url.includes("client_id=cid"));
  assert.ok(req.url.includes("code_challenge="));
  assert.ok(req.state);
  assert.ok(req.nonce);
  assert.ok(req.codeVerifier);
});
test("parseCallback returns code+state", () => {
  const r = parseCallback("https://dash/cb?code=abc&state=xyz");
  assert.equal(r?.code, "abc");
  assert.equal(r?.state, "xyz");
});
test("parseCallback rejects error param", () => {
  assert.equal(parseCallback("https://dash/cb?error=denied"), null);
});
