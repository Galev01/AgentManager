import { NextResponse } from "next/server";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeCreateUser, bridgeListUsers } from "@/lib/auth/bridge-auth-client";

export async function GET(): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.read");
    return NextResponse.json({ users: await bridgeListUsers(s.user.id, s.sid, s.user.username) });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    throw err;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const s = await requirePermissionApi("auth.users.write");
    const body = await req.json();
    const user = await bridgeCreateUser(s.user.id, s.sid, s.user.username, body);
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
