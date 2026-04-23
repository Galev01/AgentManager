import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeUnlinkOidc } from "@/lib/auth/bridge-auth-client";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; providerKey: string; issuer: string; sub: string }> },
): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id, providerKey, issuer, sub } = await ctx.params;
    await bridgeUnlinkOidc(
      s.user.id, s.sid, s.user.username,
      id, providerKey, decodeURIComponent(issuer), sub,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
