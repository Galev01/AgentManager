import { NextResponse } from "next/server";
import { clearSidCookie } from "@/lib/auth/session";
import { resolveCurrentSession } from "@/lib/auth/current-user";
import { bridgeLogout } from "@/lib/auth/bridge-auth-client";

export async function POST(): Promise<NextResponse> {
  const s = await resolveCurrentSession();
  if (s) {
    try { await bridgeLogout(s.user.id, s.sid, s.user.username); } catch {}
  }
  await clearSidCookie();
  return NextResponse.json({ ok: true });
}
