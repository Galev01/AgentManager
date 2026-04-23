import { NextRequest, NextResponse } from "next/server";
import { resolveClaudeCodePending } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requirePermissionApi("claude_code.resolve_pending");
    const { action, text } = await req.json();
    const out = await resolveClaudeCodePending(id, action, text);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof AuthFailure) return NextResponse.json({ error: e.message, missing: e.missing }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
