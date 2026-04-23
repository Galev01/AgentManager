import crypto from "node:crypto";

export type AssertionClaims = {
  sub: string; sid: string; iat: number; exp: number; username?: string;
};
export type SignInput = { sub: string; sid: string; ttlMs: number; username?: string };

function b64(buf: Buffer): string { return buf.toString("base64url"); }
function unb64(s: string): Buffer { return Buffer.from(s, "base64url"); }

export function signAssertion(secret: string, input: SignInput): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: AssertionClaims = {
    sub: input.sub, sid: input.sid, iat: now,
    exp: now + Math.floor(input.ttlMs / 1000),
    username: input.username,
  };
  const payload = b64(Buffer.from(JSON.stringify(claims), "utf8"));
  const mac = crypto.createHmac("sha256", secret).update(payload).digest();
  return `${payload}.${b64(mac)}`;
}

export function verifyAssertion(secret: string, token: string, opts: { clockSkewMs: number }): AssertionClaims | null {
  const dot = token.indexOf(".");
  if (dot < 0 || token.indexOf(".", dot + 1) >= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try { actual = unb64(sig); } catch { return null; }
  if (actual.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(actual, expected)) return null;
  let claims: AssertionClaims;
  try { claims = JSON.parse(unb64(payload).toString("utf8")) as AssertionClaims; } catch { return null; }
  if (typeof claims.sub !== "string" || typeof claims.sid !== "string") return null;
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
  const nowSec = Math.floor((Date.now() - opts.clockSkewMs) / 1000);
  if (claims.exp < nowSec) return null;
  return claims;
}
