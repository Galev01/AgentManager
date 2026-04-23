import { NextResponse } from "next/server";
import { sendWakeNow } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    await requirePermissionApi("conversations.wake");
    const { conversationKey } = await params;
    const result = await sendWakeNow(conversationKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
