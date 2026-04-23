import { NextResponse } from "next/server";
import { bridgeOidcStart } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request): Promise<NextResponse> {
  let body: { returnTo?: string } = {};
  try { body = await req.json(); } catch {}
  const returnTo = typeof body.returnTo === "string" ? body.returnTo : undefined;
  try {
    const r = await bridgeOidcStart(returnTo);
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "oidc_unavailable" }, { status: 404 });
  }
}
