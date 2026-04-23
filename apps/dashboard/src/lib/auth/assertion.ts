import crypto from "node:crypto";

const SECRET = process.env.AUTH_ASSERTION_SECRET || "";

function b64(buf: Buffer): string { return buf.toString("base64url"); }

export function signActorAssertion(input: { sub: string; sid: string; username?: string; ttlMs?: number }): string {
  if (!SECRET) throw new Error("AUTH_ASSERTION_SECRET not set");
  const now = Math.floor(Date.now() / 1000);
  const ttlMs = input.ttlMs ?? 60_000;
  const claims = {
    sub: input.sub, sid: input.sid, iat: now,
    exp: now + Math.floor(ttlMs / 1000),
    username: input.username,
  };
  const payload = b64(Buffer.from(JSON.stringify(claims), "utf8"));
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest();
  return `${payload}.${b64(mac)}`;
}
