import { cookies } from "next/headers";

const SID_COOKIE = "ocm_sid";

function cookieSecure(): boolean {
  const o = process.env.COOKIE_SECURE;
  if (o === "true") return true;
  if (o === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function setSidCookie(sid: string, expiresAt: string): Promise<void> {
  const jar = await cookies();
  const expMs = new Date(expiresAt).getTime();
  const maxAge = Math.max(1, Math.floor((expMs - Date.now()) / 1000));
  jar.set(SID_COOKIE, sid, {
    httpOnly: true, secure: cookieSecure(), sameSite: "strict",
    path: "/", maxAge,
  });
}

export async function clearSidCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SID_COOKIE);
}

export async function getSid(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SID_COOKIE)?.value ?? null;
}
