import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeResetPassword } from "@/lib/auth/bridge-auth-client";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    const { newPassword } = await req.json();
    if (typeof newPassword !== "string") return NextResponse.json({ error: "newPassword required" }, { status: 400 });
    await bridgeResetPassword(s.user.id, s.sid, s.user.username, id, newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
