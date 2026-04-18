import { cookies } from "next/headers";
import crypto from "node:crypto";

const SESSION_COOKIE = "ocm_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me-in-prod";

function sign(value: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${hmac}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  const signedBuf = Buffer.from(signed);
  const expectedBuf = Buffer.from(expected);
  if (signedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signedBuf, expectedBuf)) return null;
  // Check expiration
  const parts = value.split(":");
  const ts = Number(parts[1]);
  if (!ts || Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null;
  return value;
}

function cookieSecure(): boolean {
  // `COOKIE_SECURE` lets LAN-only HTTP deployments opt out of the Secure
  // flag (browsers drop Secure cookies on non-TLS origins). Defaults to
  // production behavior for backward compatibility.
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function createSession(): Promise<void> {
  const token = sign(`admin:${Date.now()}`);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  if (!cookie?.value) return false;
  return verify(cookie.value) !== null;
}
