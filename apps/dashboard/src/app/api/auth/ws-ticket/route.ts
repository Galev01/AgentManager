import { NextResponse } from "next/server";
import { requireAuthApi, AuthFailure } from "@/lib/auth/current-user";
import { bridgeIssueWsTicket } from "@/lib/auth/bridge-auth-client";

export async function POST(): Promise<NextResponse> {
  try {
    const s = await requireAuthApi();
    return NextResponse.json(await bridgeIssueWsTicket(s.user.id, s.sid));
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
