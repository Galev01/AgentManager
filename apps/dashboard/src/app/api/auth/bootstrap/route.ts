import { NextResponse } from "next/server";
import { bridgeBootstrap, bridgeLogin } from "@/lib/auth/bridge-auth-client";
import { setSidCookie } from "@/lib/auth/session";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { token?: string; username?: string; password?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { token, username, password } = body;
  if (typeof token !== "string" || typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "token, username, password required" }, { status: 400 });
  }

  try {
    await bridgeBootstrap({ token, username, password });
  } catch (err) {
    return NextResponse.json({ error: "bootstrap_failed", detail: String((err as Error).message) }, { status: 403 });
  }

  try {
    const r = await bridgeLogin({ username, password });
    await setSidCookie(r.sessionId, r.expiresAt);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true, note: "bootstrap_ok_login_failed" });
  }
}
