import { NextResponse } from "next/server";
import { setSidCookie } from "@/lib/auth/session";
import { bridgeLogin, bridgeLoginLegacy } from "@/lib/auth/bridge-auth-client";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { username?: string; password?: string; legacy?: boolean };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { username, password, legacy } = body;
  if (typeof password !== "string") {
    return NextResponse.json({ error: "password_required" }, { status: 400 });
  }

  if (legacy) {
    try {
      const r = await bridgeLoginLegacy({ password });
      await setSidCookie(r.sessionId, r.expiresAt);
      return NextResponse.json({ ok: true, user: r.user });
    } catch {
      return NextResponse.json({ error: "not_available" }, { status: 401 });
    }
  }

  if (typeof username !== "string") {
    return NextResponse.json({ error: "username_required" }, { status: 400 });
  }

  try {
    const r = await bridgeLogin({ username, password });
    await setSidCookie(r.sessionId, r.expiresAt);
    return NextResponse.json({ ok: true, user: r.user });
  } catch (err) {
    const msg = String((err as Error).message || "");
    if (msg.includes("bootstrap_required")) {
      return NextResponse.json({ error: "bootstrap_required" }, { status: 401 });
    }
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
}
