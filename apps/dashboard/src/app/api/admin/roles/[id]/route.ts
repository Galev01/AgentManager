import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeUpdateRole, bridgeDeleteRole } from "@/lib/auth/bridge-auth-client";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.roles.write");
    const { id } = await ctx.params;
    const body = await req.json();
    return NextResponse.json({ role: await bridgeUpdateRole(s.user.id, s.sid, s.user.username, id, body) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.roles.write");
    const { id } = await ctx.params;
    await bridgeDeleteRole(s.user.id, s.sid, s.user.username, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
