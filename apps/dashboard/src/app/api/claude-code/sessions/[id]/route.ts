import { NextRequest, NextResponse } from "next/server";
import { patchClaudeCodeSession } from "@/lib/bridge-client";
import { requirePermissionApi, AuthFailure } from "@/lib/auth/current-user";
import type { PermissionId } from "@openclaw-manager/types";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const needed: PermissionId = body?.mode !== undefined ? "claude_code.change_mode" : "claude_code.rename";
  try {
    await requirePermissionApi(needed);
    const out = await patchClaudeCodeSession(id, body);
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof AuthFailure) return NextResponse.json({ error: e.message, missing: e.missing }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
