import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeListRoles, bridgeCreateRole } from "@/lib/auth/bridge-auth-client";

export async function GET(): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.roles.read");
    return NextResponse.json({ roles: await bridgeListRoles(s.user.id, s.sid, s.user.username) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.roles.write");
    const body = await req.json();
    return NextResponse.json({ role: await bridgeCreateRole(s.user.id, s.sid, s.user.username, body) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
