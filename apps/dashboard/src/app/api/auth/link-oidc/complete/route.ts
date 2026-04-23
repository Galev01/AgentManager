import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeLinkOidcComplete } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    const body = await req.json();
    if (typeof body?.providerKey !== "string" || typeof body?.issuer !== "string" || typeof body?.sub !== "string") {
      return NextResponse.json({ error: "providerKey, issuer, sub required" }, { status: 400 });
    }
    await bridgeLinkOidcComplete(s.user.id, s.sid, s.user.username, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
