import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeChangePassword } from "@/lib/auth/bridge-auth-client";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    const body = (await request.json()) ?? {};
    const { oldPassword, newPassword } = body;
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "oldPassword and newPassword required" }, { status: 400 });
    }
    await bridgeChangePassword(s.user.id, s.sid, s.user.username, { oldPassword, newPassword });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
