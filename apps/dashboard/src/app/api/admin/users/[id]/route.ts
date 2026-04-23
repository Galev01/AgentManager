import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeGetUser, bridgeUpdateUser, bridgeDeleteUser } from "@/lib/auth/bridge-auth-client";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.read");
    const { id } = await ctx.params;
    return NextResponse.json({ user: await bridgeGetUser(s.user.id, s.sid, s.user.username, id) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    const body = await req.json();
    return NextResponse.json({ user: await bridgeUpdateUser(s.user.id, s.sid, s.user.username, id, body) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const { id } = await ctx.params;
    if (id === s.user.id) return NextResponse.json({ error: "cannot_delete_self" }, { status: 400 });
    await bridgeDeleteUser(s.user.id, s.sid, s.user.username, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
