import { NextResponse } from "next/server";
import { sendRelease } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(_req: Request, { params }: { params: Promise<{ conversationKey: string }> }) {
  try {
    await requirePermissionApi("conversations.release");
    const { conversationKey } = await params;
    const result = await sendRelease(conversationKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthFailure) return NextResponse.json({ error: err.message, missing: err.missing }, { status: err.status });
    return NextResponse.json({ error: "Bridge unreachable" }, { status: 503 });
  }
}
